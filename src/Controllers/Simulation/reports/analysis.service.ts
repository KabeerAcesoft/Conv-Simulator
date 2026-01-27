import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  CONVERSATION_SIMULATION_STATES,
  CONVERSATION_STATE,
  RESPONSE_SCORE_JSON_RESPONSE,
  SIMULATION_STATUS,
} from 'src/constants/constants';
import { helper } from 'src/utils/HelperService';

import { AIStudioService } from '../../AIStudio/ai-studio.service';
import { CacheService } from '../../Cache/cache.service';
import { AppConfigurationService } from '../../Configuration/configuration.service';
import { ConversationCloudService } from '../../ConversationalCloud/conversation-cloud.service';
import { DatabaseService } from '../../Database/database.service';
import {
  AgentAssessment,
  AgentProfile,
  AgentScenarioOutcome,
  PerformanceMetrics,
  ScenarioPerformanceMetrics,
  SimulationConversation,
  TaskStatus,
} from '../simulation.dto';

import {
  agentProfileToText,
  getAvgAIScore,
  getAvgDuration,
  getCsat,
  getCustomerInfoSdes,
  getFCR,
  getMCS,
  getNPS,
  getPersonalInfoSde,
  getSurveyAnswer,
  objectToText,
} from './analysis.helpers';

const context_ = helper.ctx.bind(helper);
const insertCCBearer = helper.insertCCBearer.bind(helper);
const fillPrompt = helper.fillPrompt.bind(helper);
const findJSON = helper.findJSON.bind(helper);

export const context = '[AnalysisService]';

@Injectable()
export class AnalysisService {
  constructor(
    @InjectPinoLogger(AnalysisService.name)
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => AppConfigurationService))
    private readonly appConfigService: AppConfigurationService,
    private readonly aiStudioService: AIStudioService,
    private readonly databaseService: DatabaseService,
    private readonly conversationCloudService: ConversationCloudService,
    private readonly cache: CacheService,
  ) {
    this.logger.setContext(context);
  }

  async getTaskSummary(accountId: string) {
    const toInclude = [
      'accountId',
      'createdBy',
      'createdAt',
      'requestId',
      'status',
      'completedConversations',
      'inFlightConversations',
      'maxConversations',
      'remaining',
      'mcs',
      'csat',
      'fcr',
      'nps',
      'feedback',
      'type',
    ];

    const timeframe = {
      from: Date.now() - 7 * 24 * 60 * 60 * 1000,
      to: Date.now(),
    };

    const tasks = await this.databaseService.getTasks(
      accountId,
      toInclude,
      timeframe,
    );

    return tasks;
  }

  async getConversation(
    accountId: string,
    conversationId: string,
    includeAll?: boolean,
  ): Promise<SimulationConversation | undefined> {
    const conversation = await this.cache.getConversation(
      accountId,
      conversationId,
    );

    if (!conversation) {
      this.logger.warn({
        fn: 'getConversation',
        message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });
    }

    if (includeAll) {
      const scenario = await this.databaseService.getScenario(
        conversation.scenario,
      );

      const persona = await this.databaseService.getPersona(
        accountId,
        conversation.persona,
      );

      conversation.promptVariables = {
        ...conversation.promptVariables,
        scenario: scenario,
        persona: persona,
      };
    }

    return conversation;
  }

  /**
   * Helper methods for concludeConversation
   */
  private async getTaskAndUpdateCounts(
    accountId: string,
    requestId: string,
    functionName: string,
  ): Promise<TaskStatus | null> {
    const task = await this.cache.getTask(accountId, requestId);

    if (!task) {
      this.logger.error({
        fn: functionName,
        message: `No task found for account ${accountId} and requestId ${requestId}`,
        accountId,
        requestId,
      });

      return null;
    }

    this.databaseService.updateTask(
      accountId,
      requestId,
      {
        updatedAt: Date.now(),
        inFlightConversations:
          Number(task.inFlightConversations) - 1 < 0
            ? 0
            : Number(task.inFlightConversations) - 1,
        completedConversations: task.completedConversations + 1,
        completedConvIds: task.completedConvIds || [],
      },
      [],
    );

    return task;
  }

  private async getConversationFromCache(
    accountId: string,
    conversationId: string,
    functionName: string,
  ): Promise<SimulationConversation | null> {
    const conversation = await this.cache.getConversation(
      accountId,
      conversationId,
    );

    if (conversation) {
      return conversation;
    }

    const databaseConversation = await this.databaseService.getConversation(
      accountId,
      conversationId,
    );

    if (databaseConversation) {
      await this.cache.addConversation(accountId, databaseConversation);

      return databaseConversation;
    }

    this.logger.error({
      fn: functionName,
      message: `No conversation found for account ${accountId} and conversationId ${conversationId}`,
      accountId,
      conversationId,
    });

    return null;
  }

  private async getAuthToken(
    taskAccountId: string,
    accountId: string,
    conversationId: string,
    functionName: string,
  ): Promise<string | null> {
    const token =
      await this.appConfigService.getTokenWithFallback(taskAccountId);

    if (!token) {
      this.logger.error({
        fn: functionName,
        message: `No token found for account ${accountId} and conversationId ${conversationId}`,
        accountId,
        conversationId,
      });

      return null;
    }

    return token;
  }

  private async getAssessmentData(
    accountId: string,
    conversationId: string,
    task: TaskStatus,
    conversation: SimulationConversation,
    token: string,
    functionName: string,
  ): Promise<any> {
    const promptId = task?.prompts?.conversationAssessment;

    if (!promptId) {
      this.logger.error({
        fn: functionName,
        message: `No promptId found`,
        accountId,
        conversationId,
      });

      return null;
    }

    const basePrompt = await this.databaseService.getPrompt(
      accountId,
      promptId,
      true,
    );

    const scenario = await this.databaseService.getScenarioById(
      accountId,
      conversation.scenario,
    );

    const persona = await this.databaseService.getPersonaById(
      accountId,
      conversation.persona,
    );

    if (!scenario) {
      this.logger.error({
        fn: functionName,
        message: `No scenario found`,
        accountId,
        conversationId,
      });

      return null;
    }

    const { filtered, transcript } =
      await this.conversationCloudService.getConversationInfo(
        accountId,
        token,
        conversationId,
      );

    console.info('filtered', filtered);

    if (!filtered || !transcript) {
      this.logger.error({
        fn: functionName,
        message: `No conversation details found`,
        accountId,
        conversationId,
      });

      return null;
    }

    return {
      basePrompt,
      brand_name: task.brandName,
      filtered,
      persona,
      scenario,
      transcript,
    };
  }

  private createConversationRecord(
    conversation: SimulationConversation,
    filtered: any,
  ): SimulationConversation {
    return Object.assign({}, conversation, { metadata: filtered });
  }

  private async generateAssessment(
    accountId: string,
    conversation: SimulationConversation,
    token: string,
    basePrompt: string,
    transcript: string,
    filtered: any,
    scenario: any,
    persona: any,
    brand_name: string,
  ): Promise<any> {
    let conversation_details = '';

    const toInclude = [
      'closeReason',
      'startTimeL',
      'endTimeL',
      'duration',
      'latestAgentFullName',
      'latestSkillName',
      'mcs',
      'mcsTrend',
      'csat',
      'nps',
      'feedback',
      'fcr',
    ];

    for (const [key, value] of Object.entries(filtered)) {
      if (value && toInclude.includes(key)) {
        const stringValue =
          typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : (value as number | string);

        conversation_details += `${key}: ${stringValue}\n`;
      }
    }

    const closeReason = filtered?.closeReason || 'unknown';

    let prompt = fillPrompt(basePrompt, {
      transcript,
      conversation_details,
      scenario,
      persona,
      brand_name,
      closeReason,
    });

    prompt += RESPONSE_SCORE_JSON_RESPONSE;

    const assessment = await this.aiStudioService.getFlowResponse({
      accountId,
      conv_id: conversation.aisConversationId,
      flow_id: conversation.flowId,
      token: insertCCBearer(token),
      prompt,
      messages: conversation.messages || [],
    });

    if ('flowRequest' in conversation) delete conversation.flowRequest;

    if ('conversationSurveys' in conversation)
      delete conversation.conversationSurveys;

    return assessment;
  }

  private prepareFinalConversationData(filtered: any): {
    fObject: any;
    toExclude: string[];
  } {
    const toInclude = [
      'closeReason',
      'startTimeL',
      'endTimeL',
      'duration',
      'latestAgentId',
      'latestSkillId',
      'latestAgentGroupId',
      'mcs',
      'mcsTrend',
      'nps',
      'csat',
      'feedback',
      'fcr',
    ];

    const surveyFields = ['nps', 'csat', 'feedback', 'fcr'];

    const fObject: any = {};

    for (const [key, value] of Object.entries(filtered)) {
      // For survey fields, only include if they exist (not null or undefined)
      // Note: 0 and false are VALID responses from customers, so we keep them!
      // The getSurveyAnswer functions in HelperService return null when there's no response
      if (surveyFields.includes(key)) {
        if (value !== null && value !== undefined && value !== '') {
          Object.defineProperty(fObject, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      } else if (
        toInclude.includes(key) &&
        value !== null &&
        value !== undefined
      ) {
        // For non-survey fields, include all truthy values and explicit 0/false
        Object.defineProperty(fObject, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }

    return {
      fObject,
      toExclude: [
        'pendingConsumer',
        'pendingConsumerRespondTime',
        'consumerToken',
        'dialogId',
        'dialogType',
        'promptVariables',
        'queued',
        'messages',
        'operational_factors',
        'metadata',
      ],
    };
  }

  async concludeConversation(
    accountId: string,
    conversationId: string,
    requestId: string,
  ) {
    const function_ = 'concludeConversation';

    try {
      // Get task and update conversation counts
      const task = await this.getTaskAndUpdateCounts(
        accountId,
        requestId,
        function_,
      );

      if (!task) return;

      // Get conversation from cache
      const conversation = await this.getConversationFromCache(
        accountId,
        conversationId,
        function_,
      );

      if (!conversation) return;

      // Get authentication token
      const token = await this.getAuthToken(
        task.accountId,
        accountId,
        conversationId,
        function_,
      );

      if (!token) return;

      // Get assessment prompt and conversation metadata
      const assessmentData = await this.getAssessmentData(
        accountId,
        conversationId,
        task,
        conversation,
        token,
        function_,
      );

      if (!assessmentData) return;

      const {
        filtered,
        transcript,
        basePrompt,
        scenario,
        persona,
        brand_name,
      } = assessmentData;

      // Create conversation record with metadata
      const record = this.createConversationRecord(conversation, filtered);

      // Generate and attach assessment
      const assessment = await this.generateAssessment(
        accountId,
        conversation,
        token,
        basePrompt,
        transcript,
        filtered,
        scenario,
        persona,
        brand_name,
      );

      record.assessment = helper.findJSON(assessment?.text);

      // Prepare final conversation document
      const { fObject, toExclude } =
        this.prepareFinalConversationData(filtered);

      // Update conversation in database
      await this.databaseService.updateConversation(
        accountId,
        conversationId,
        {
          fObj: fObject,
          assessment: record.assessment,
          active: false,
          status: CONVERSATION_STATE.CLOSE,
          state: CONVERSATION_SIMULATION_STATES.COMPLETED,
        },
        toExclude,
      );
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error concluding conversation for account ${accountId} and conversationId ${conversationId}: ${error}`,
        accountId,
        conversationId,
      });

      await this.databaseService.updateConversation(accountId, conversationId, {
        assessment: {
          score: '-',
          assessment: 'Error creating assessment',
        },
        active: false,
        status: CONVERSATION_STATE.CLOSE,
        state: CONVERSATION_SIMULATION_STATES.COMPLETED,
      });
    } finally {
      // this.nextAction(accountId, requestId)
    }
  }

  createAgentScenarioOutcomes(
    agentConversations: SimulationConversation[],
  ): AgentScenarioOutcome[] {
    const scenarioObject: Record<
      string,
      {
        avgScore: number | null;
        maxScore: number | null;
        minScore: number | null;
        outcomes: string[] | null;
        scores: number[];
      }
    > = {};

    // Process each conversation and group by scenario
    for (const conv of agentConversations) {
      const scenarioId = conv.scenario;

      this.initializeScenarioIfNeeded(scenarioObject, scenarioId);

      const score = conv.assessment?.score ?? null;
      const assessment = conv.assessment?.assessment ?? null;

      this.processConversationScore(scenarioObject, scenarioId, score);

      if (assessment) {
        const descriptor = Object.getOwnPropertyDescriptor(
          scenarioObject,
          scenarioId,
        );

        if (descriptor?.value) {
          descriptor.value.outcomes.push(assessment);
        }
      }
    }

    // Convert scenario object to array
    return this.convertScenarioObjectToArray(scenarioObject);
  }

  /**
   * Initializes scenario entry if it doesn't exist
   */
  private initializeScenarioIfNeeded(
    scenarioObject: Record<string, any>,
    scenarioId: string,
  ): void {
    if (!Object.prototype.hasOwnProperty.call(scenarioObject, scenarioId)) {
      Object.defineProperty(scenarioObject, scenarioId, {
        value: {
          scores: [],
          minScore: null,
          maxScore: null,
          avgScore: null,
          outcomes: [],
        },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  /**
   * Processes and validates conversation score, updating scenario statistics
   */
  private processConversationScore(
    scenarioObject: Record<string, any>,
    scenarioId: string,
    score: any,
  ): void {
    if (score === null || typeof score !== 'number' || isNaN(score)) {
      this.logger.error(`Invalid score for scenario ${scenarioId}: ${score}`);

      return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      scenarioObject,
      scenarioId,
    );

    if (!descriptor) return;

    const scenario = descriptor.value;

    scenario.scores.push(score);

    // Update min/max scores
    this.updateMinMaxScores(scenario, score);

    // Calculate average from valid scores
    scenario.avgScore =
      scenario.scores.reduce((a: number, b: number) => a + b, 0) /
      scenario.scores.length;
  }

  /**
   * Updates minimum and maximum scores for a scenario
   */
  private updateMinMaxScores(scenario: any, score: number): void {
    if (scenario.minScore === null) {
      scenario.minScore = score;
    } else {
      scenario.minScore = Math.min(scenario.minScore, score);
    }

    if (scenario.maxScore === null) {
      scenario.maxScore = score;
    } else {
      scenario.maxScore = Math.max(scenario.maxScore, score);
    }
  }

  /**
   * Converts scenario object to array format
   */
  private convertScenarioObjectToArray(
    scenarioObject: Record<string, any>,
  ): AgentScenarioOutcome[] {
    const array: AgentScenarioOutcome[] = [];

    for (const scenarioId in scenarioObject) {
      if (!Object.prototype.hasOwnProperty.call(scenarioObject, scenarioId)) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        scenarioObject,
        scenarioId,
      );

      if (!descriptor?.value) continue;

      const scenario = descriptor.value;

      array.push({
        scenarioId: scenarioId,
        scores: scenario.scores,
        minScore: scenario.minScore,
        maxScore: scenario.maxScore,
        avgScore: scenario.avgScore,
        outcomes: scenario.outcomes,
      });
    }

    return array;
  }

  /**
   * Validates inputs for agent performance analysis
   */
  private validateAgentPerformanceInputs(
    uniqueAgents: SimulationConversation[],
    conversations: SimulationConversation[] | null,
    token: string,
    taskId: string,
  ): AgentAssessment[] | null {
    if (!uniqueAgents || uniqueAgents.length === 0) {
      this.logger.warn({
        fn: 'analyseAgentPerformance',
        message: 'No unique agents found in task',
        taskId,
      });

      return [];
    }

    if (!conversations || conversations.length === 0) {
      this.logger.warn({
        fn: 'analyseAgentPerformance',
        message: 'No conversations found in task',
        taskId,
      });

      return [];
    }

    if (!token) {
      throw new InternalServerErrorException('authentication token missing');
    }

    return null;
  }

  /**
   * Calculates performance metrics for all agents
   */
  private calculateAgentMetrics(
    uniqueAgents: SimulationConversation[],
    conversations: SimulationConversation[],
    taskId: string,
  ): Record<string, PerformanceMetrics> {
    const agents: Record<string, PerformanceMetrics> = {};

    for (const agent of uniqueAgents) {
      const agentId = agent.metadata?.latestAgentId;
      const agentName = agent.metadata?.latestAgentFullName;

      if (!agentId || !agentName) {
        this.logger.warn({
          fn: 'analyseAgentPerformance',
          message: `Skipping agent with missing ID or name`,
          agentId,
          agentName,
          taskId,
        });

        continue;
      }

      const agentConversations = conversations.filter(
        (c): c is SimulationConversation =>
          c.metadata?.latestAgentId === agentId,
      );

      if (agentConversations.length === 0) {
        this.logger.warn({
          fn: 'analyseAgentPerformance',
          message: `No conversations found for agent ${agentName} (ID: ${agentId})`,
          taskId,
        });

        continue;
      }

      const metrics = this.computeAgentMetrics(agentConversations);
      const agentKey = `${agentId}_${agentName}`;

      Object.defineProperty(agents, agentKey, {
        value: {
          agentId,
          agent: agentName,
          ...metrics,
        },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return agents;
  }

  /**
   * Computes performance metrics for an agent
   */
  private computeAgentMetrics(
    agentConversations: SimulationConversation[],
  ): Partial<PerformanceMetrics> {
    const mcs = getMCS(agentConversations);
    const csat = getCsat(agentConversations);
    const nps = getNPS(agentConversations);
    const fcr = getFCR(agentConversations);
    const duration = getAvgDuration(agentConversations);

    const { avgAIScore: avg_ai_score, ai_assessments } =
      getAvgAIScore(agentConversations);

    const agentScenarioOutcomes =
      this.createAgentScenarioOutcomes(agentConversations);

    return {
      mcs,
      csat,
      nps,
      fcr,
      avg_ai_score,
      ai_assessments,
      duration,
      agentScenarioOutcomes,
    };
  }

  /**
   * Generates AI assessments for all agents
   */
  private async generateAgentAssessments(
    uniqueAgents: SimulationConversation[],
    agents: Record<string, PerformanceMetrics>,
    task: TaskStatus,
    token: string,
    basePrompt: string,
  ): Promise<AgentAssessment[]> {
    const agentPerformance: AgentAssessment[] = [];

    for (const agentConv of uniqueAgents) {
      const agentId = agentConv?.metadata?.latestAgentId;
      const agentName = agentConv?.metadata?.latestAgentFullName;
      const agentKey = `${agentId}_${agentName}`;

      const descriptor = Object.getOwnPropertyDescriptor(agents, agentKey);

      if (!descriptor?.value) {
        this.logger.warn({
          fn: 'analyseAgentPerformance',
          message: `Agent data not found for key: ${agentKey}`,
          taskId: task.requestId,
        });

        continue;
      }

      const assessment = await this.generateSingleAgentAssessment(
        descriptor.value,
        task,
        token,
        basePrompt,
      );

      if (assessment) {
        agentPerformance.push(assessment);
      }
    }

    return agentPerformance;
  }

  /**
   * Generates assessment for a single agent
   */
  private async generateSingleAgentAssessment(
    agentData: PerformanceMetrics,
    task: TaskStatus,
    token: string,
    basePrompt: string,
  ): Promise<AgentAssessment | null> {
    const {
      agentId,
      agent: agentName,
      mcs,
      csat,
      nps,
      fcr,
      avg_ai_score,
      ai_assessments,
      duration,
      agentScenarioOutcomes,
    } = agentData;

    let agentScenarioOutcomesText = '';

    for (const outcome of agentScenarioOutcomes) {
      const scenarioName = await this.databaseService.getScenarioNameById(
        task.accountId,
        outcome.scenarioId,
      );

      agentScenarioOutcomesText += `
    scenario: "${scenarioName}"
    avgScore: ${outcome.avgScore}
    outcomes: "${outcome.outcomes}"
    `;
    }

    const prompt = fillPrompt(basePrompt, {
      mcs,
      csat,
      nps,
      fcr,
      avg_ai_score,
      ai_assessments,
      duration,
      agentScenarioOutcomes: agentScenarioOutcomesText,
    });

    const agentAnalysis = await this.aiStudioService.getFlowResponse({
      accountId: task.accountId,
      token: insertCCBearer(token),
      flow_id: task.flowId,
      prompt,
      text: 'the results of the conversation simulation are provided, give feedback as per the instructions in the prompt',
    });

    if (!agentAnalysis?.text) {
      this.logger.error({
        fn: 'analyseAgentPerformance',
        accountId: task.accountId,
        taskId: task.requestId,
        message: 'Error in getting agent analysis',
        agentName,
        agentId,
      });

      return null;
    }

    const feedback = this.formatAgentFeedback(agentAnalysis.text);

    return {
      agent: agentName,
      agentId,
      mcs: isNaN(mcs) ? null : mcs,
      csat: isNaN(csat) ? null : csat,
      nps: isNaN(nps) ? null : nps,
      fcr: isNaN(fcr) ? null : fcr,
      avg_ai_score: isNaN(avg_ai_score) ? null : avg_ai_score,
      duration: isNaN(duration) ? null : duration,
      ai_assessment:
        typeof ai_assessments === 'object'
          ? JSON.stringify(ai_assessments)
          : ai_assessments,
      feedback,
      agentScenarioOutcomes: agentData.agentScenarioOutcomes,
    };
  }

  /**
   * Formats agent feedback text
   */
  private formatAgentFeedback(feedbackText: string): string {
    let feedback = feedbackText || '';

    // Safe stringify that handles circular references
    const safeStringify = (object: any): string => {
      try {
        return JSON.stringify(object);
      } catch {
        const seen = new WeakSet();

        try {
          return (
            JSON.stringify(object, (_k, v) => {
              if (typeof v === 'object' && v !== null) {
                if (seen.has(v)) return '[Circular]';
                seen.add(v);
              }

              return v;
            }) || String(object)
          );
        } catch {
          return String(object);
        }
      }
    };

    if (typeof findJSON(feedback) === 'object') {
      const _feedback = findJSON(feedbackText);

      if (_feedback) {
        feedback = Object.entries(_feedback)
          .map(([key, value]) => {
            let stringValue: string;

            if (value === null || typeof value === 'undefined') {
              stringValue = '';
            } else if (typeof value === 'object') {
              try {
                stringValue = JSON.stringify(value);
              } catch {
                // fallback to safe stringifier if JSON serialization fails
                stringValue = safeStringify(value);
              }
            } else {
              stringValue = safeStringify(value);
            }

            return `${key}: ${stringValue}`;
          })
          .join('\n');
      } else {
        feedback = JSON.stringify(feedbackText);
      }
    }

    return feedback;
  }

  async analyseAgentPerformance(
    task: TaskStatus,
    token: string,
    accountId: string,
    agentConversations: SimulationConversation[] | null = null,
    agentId: string,
    basePrompt: string,
  ): Promise<AgentProfile | null> {
    const agentPerformanceProfile = await this.createAgentProfile(
      accountId,
      Number(agentId),
      agentConversations,
    );

    if (!agentPerformanceProfile) {
      throw new InternalServerErrorException(
        `Failed to create agent profile for account ${accountId} and agentId ${agentId}`,
      );
    }

    const { mcs, csat, nps, fcr, ai_score, duration } =
      agentPerformanceProfile?.averages || {};

    const agentPerformanceText = agentProfileToText(agentPerformanceProfile);

    const prompt = fillPrompt(basePrompt, {
      mcs,
      csat,
      nps,
      fcr,
      ai_score,
      duration,
      agentPerformance: agentPerformanceText,
    });

    const agentAnalysis = await this.aiStudioService.getFlowResponse({
      accountId,
      token: insertCCBearer(token),
      flow_id: task.flowId,
      prompt,
      text: 'analysis',
    });

    if (!agentAnalysis?.text) {
      this.logger.error({
        fn: 'analyseAgentPerformance',
        accountId,
        taskId: task.requestId,
        message:
          'Error in getting agent analysis - returning profile without AI assessment',
        agentId,
      });

      // Return the profile without AI assessment rather than null
      agentPerformanceProfile.ai_assessment =
        'AI analysis failed or unavailable';

      return agentPerformanceProfile;
    }

    let feedback = agentAnalysis.text || '';

    /**
     * If the feedback is a JSON object, we need to fix, parse, and
     * format it as readable text
     * it might simply be plain text - so no problem if FINDJSON fails
     */
    const json = findJSON(feedback);

    if (typeof json === 'object' && json !== null) {
      const originalFeedback = feedback;
      const convertedFeedback = objectToText(json, 2);

      // Only use converted feedback if it's valid, otherwise keep original
      if (convertedFeedback && convertedFeedback.trim().length > 0) {
        feedback = convertedFeedback;
      } else {
        this.logger.warn({
          fn: 'analyseAgentPerformance',
          message: `objectToText returned empty/null, keeping original feedback`,
          accountId,
          taskId: task.requestId,
          agentId,
          originalFeedback,
          convertedFeedback,
        });
        // Keep the original feedback
      }
    }

    agentPerformanceProfile.ai_assessment = feedback;

    return agentPerformanceProfile;
  }

  async analyseAgentPerformanceForAllAgents(
    task: TaskStatus,
    token: string,
    conversations: SimulationConversation[] | null = null,
    uniqueAgents: SimulationConversation[] = [],
  ): Promise<AgentProfile[]> {
    if (!uniqueAgents || uniqueAgents.length === 0) {
      this.logger.warn({
        fn: 'analyseAgentPerformance',
        message: 'No unique agents found in task',
        taskId: task.requestId,
      });

      return [];
    }

    if (!conversations || conversations.length === 0) {
      this.logger.warn({
        fn: 'analyseAgentPerformance',
        message: 'No conversations found in task',
        taskId: task.requestId,
      });

      return [];
    }

    const { accountId } = task;

    if (!token) {
      throw new InternalServerErrorException('authentication token missing');
    }

    const promptId = task.prompts.agentAssessment;

    const basePrompt = await this.databaseService.getPrompt(
      accountId,
      promptId,
      true,
    );

    if (!basePrompt) {
      throw new InternalServerErrorException(
        'Base prompt for agent assessment not found. promptId: ' + promptId,
      );
    }

    const agentPerformance: AgentProfile[] = [];

    for (const agent of uniqueAgents) {
      const agentId = agent.metadata?.latestAgentId;
      const agentName = agent.metadata?.latestAgentFullName;

      if (!agentId) {
        this.logger.warn({
          fn: 'analyseAgentPerformance',
          message: `Skipping agent with missing ID or name`,
          agentId,
          agentName,
          taskId: task.requestId,
        });

        continue;
      }

      const agentConversations = conversations.filter(
        (c): c is SimulationConversation =>
          c.metadata?.latestAgentId === agentId,
      );

      if (agentConversations.length === 0) {
        this.logger.warn({
          fn: 'analyseAgentPerformance',
          message: `No conversations found for agent ${agentName} (ID: ${agentId})`,
          taskId: task.requestId,
        });

        continue;
      }

      /*
       * run analysis for each agent in parallel, but wait 2 seconds between * each to avoid rate limiting
       */

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const agentPerf = await this.analyseAgentPerformance(
        task,
        token,
        accountId,
        agentConversations,
        agentId,
        basePrompt,
      );

      if (agentPerf) {
        agentPerformance.push(agentPerf);
      }
    }

    return agentPerformance;
  }

  async analyseTask(
    accountId: string,
    task: TaskStatus,
    conversations: SimulationConversation[] | null = null,
    agent_performance: string,
    total_agents: number,
  ) {
    try {
      const token = await this.appConfigService.getTokenWithFallback(
        task.accountId,
      );

      if (!token) {
        throw new InternalServerErrorException('authentication token missing');
      }

      const promptId = task.prompts.simulationAssessment;

      const basePrompt = await this.databaseService.getPrompt(
        accountId,
        promptId,
        true,
      );

      if (!basePrompt) {
        throw new InternalServerErrorException(
          'Base prompt for agent assessment not found. promptId: ' +
            promptId +
            ', task: ' +
            task?.taskName || task.requestId,
        );
      }

      const allAIScores = conversations
        .filter(
          (c): c is SimulationConversation =>
            typeof c !== 'string' &&
            c.assessment?.score !== null &&
            c.assessment?.score !== undefined,
        )
        .map((c) => c.assessment?.score);

      const avg_ai_score =
        allAIScores.length > 0
          ? allAIScores.reduce((a, b) => a + b, 0) / allAIScores.length
          : null;

      const min_ai_score =
        allAIScores.length > 0 ? Math.min(...allAIScores) : null;

      const max_ai_score =
        allAIScores.length > 0 ? Math.max(...allAIScores) : null;

      task.mcs = getMCS(conversations, true);
      task.csat = getCsat(conversations, true);
      task.nps = getNPS(conversations, true);
      task.fcr = getFCR(conversations, true);

      const prompt = fillPrompt(basePrompt, {
        agent_performance,
        avg_ai_score,
        min_ai_score,
        max_ai_score,
        total_agents,
        brand_name: task?.brandName || '',
        total_conversations: conversations.length,
        mcs: task.mcs,
        csat: task.csat,
        nps: task.nps,
        fcr: task.fcr,
      });

      const overallAnalysis = await this.aiStudioService.getFlowResponse({
        accountId: task.accountId,
        flow_id: task.flowId,
        token: insertCCBearer(token),
        prompt,
        text: 'the results of the conversation simulation are provided, give feedback as per the instructions in the prompt',
      });

      task.feedback = overallAnalysis?.text || '';

      return {
        feedback: task.feedback,
        nps: isNaN(task.nps) ? null : task.nps,
        csat: isNaN(task.csat) ? null : task.csat,
        fcr: isNaN(task.fcr) ? null : task.fcr,
        mcs: isNaN(task.mcs) ? null : task.mcs,
      };
    } catch (error) {
      this.logger.error({
        fn: 'analyseTask',
        message: `Error analysing task for account ${accountId}: ${error}`,
        accountId,
        taskId: task.requestId,
      });

      throw new InternalServerErrorException(
        `Error analysing task for account ${accountId}: ${error}`,
      );
    }
  }

  analyseScenarios(
    conversations: SimulationConversation[],
  ): Record<string, ScenarioPerformanceMetrics> {
    const uniqueScenarios = conversations.reduce(
      (accumulator, conversation) => {
        if (conversation.scenario) {
          accumulator.add(conversation.scenario);
        }

        return accumulator;
      },
      new Set<string>(),
    );

    const scenarioAnalysis: Record<string, ScenarioPerformanceMetrics> = {};

    for (const _scenario of uniqueScenarios) {
      const scenarioConversations = conversations.filter(
        (c): c is SimulationConversation => c.scenario === _scenario,
      );

      if (!scenarioConversations || scenarioConversations.length === 0) {
        continue;
      }

      if (scenarioConversations.length === 0) {
        continue;
      }

      const mcs = getMCS(scenarioConversations);
      const csat = getCsat(scenarioConversations);
      const nps = getNPS(scenarioConversations);
      const fcr = getFCR(scenarioConversations);
      const duration = getAvgDuration(scenarioConversations);
      const { avgAIScore } = getAvgAIScore(scenarioConversations);

      Object.defineProperty(scenarioAnalysis, _scenario, {
        value: {
          mcs,
          csat,
          nps,
          fcr,
          duration,
          avg_ai_score: avgAIScore,
          ai_assessment: '',
        },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return scenarioAnalysis;
  }

  /**
   * Analyzes all conversations individually to populate assessment scores and other metrics
   * This ensures all key metrics are available before creating agent profiles
   */
  async analyzeAllConversations(
    accountId: string,
    task: TaskStatus,
    conversations: SimulationConversation[],
    token: string,
  ): Promise<SimulationConversation[]> {
    const function_ = 'analyzeAllConversations';
    const analysedConversations: SimulationConversation[] = [];

    try {
      // Get conversation assessment prompt
      const promptId = task?.prompts?.conversationAssessment;

      if (!promptId) {
        this.logger.warn({
          fn: function_,
          message: `No conversation assessment promptId found for task ${task.requestId}, skipping individual conversation analysis`,
          accountId,
          taskId: task.requestId,
        });

        return conversations; // Return original conversations if no prompt available
      }

      const basePrompt = await this.databaseService.getPrompt(
        accountId,
        promptId,
        true, // attempt to get from cache
      );

      if (!basePrompt) {
        this.logger.warn({
          fn: function_,
          message: `No conversation assessment prompt found for task ${task.requestId}, skipping individual conversation analysis`,
          accountId,
          taskId: task.requestId,
        });

        return conversations; // Return original conversations if no prompt available
      }

      // Process conversations in batches to avoid overwhelming the system
      const batchSize = 3; // Process 3 conversations at a time
      const batches = [];

      for (let index = 0; index < conversations.length; index += batchSize) {
        batches.push(conversations.slice(index, index + batchSize));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches.at(batchIndex);

        if (!batch) continue;

        // Process conversations in the current batch in parallel
        const batchPromises = batch.map(async (conversation) => {
          try {
            return await this.analyzeIndividualConversation(
              accountId,
              task,
              conversation,
              token,
              basePrompt,
            );
          } catch (error) {
            this.logger.error({
              fn: function_,
              message: `Error analyzing conversation ${conversation.id}`,
              accountId,
              taskId: task.requestId,
              conversationId: conversation.id,
              error: error.message || error,
            });

            // Return original conversation if analysis fails
            return conversation;
          }
        });

        const batchResults = await Promise.all(batchPromises);

        analysedConversations.push(...batchResults);

        // Add delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      return analysedConversations;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error analyzing conversations for task ${task.requestId}`,
        accountId,
        taskId: task.requestId,
        error: error.message || error,
      });

      return conversations; // Return original conversations if bulk analysis fails
    }
  }

  /**
   * Adds survey fields to updates object only if they have valid values
   */
  private addSurveyFieldsToUpdates(
    updates: any,
    conversationSurveys: any,
  ): void {
    const csat = getSurveyAnswer(conversationSurveys, 'csat');

    if (csat !== null && csat !== undefined) {
      updates.csat = csat;
    }

    const nps = getSurveyAnswer(conversationSurveys, 'nps');

    if (nps !== null && nps !== undefined) {
      updates.nps = nps;
    }

    const fcr = getSurveyAnswer(conversationSurveys, 'fcr');

    if (fcr !== null && fcr !== undefined) {
      updates.fcr = fcr;
    }
  }

  /**
   * Analyzes an individual conversation to populate assessment scores and other metrics
   * This is a streamlined version of the concludeConversation logic
   */
  async analyzeIndividualConversation(
    accountId: string,
    task: TaskStatus,
    conversation: SimulationConversation,
    token: string,
    basePrompt: string,
    reanalyse?: boolean,
  ): Promise<SimulationConversation> {
    const function_ = 'analyzeIndividualConversation';

    try {
      // Skip if conversation already has assessment
      if (!reanalyse && conversation.assessment?.score) {
        return conversation;
      }

      // Get scenario and persona details
      const scenario = await this.databaseService.getScenarioById(
        accountId,
        conversation.scenario,
      );

      if (!scenario) {
        this.logger.warn({
          fn: function_,
          message: `No scenario found for conversation ${conversation.id}, skipping analysis`,
          accountId,
          conversationId: conversation.id,
          scenarioId: conversation.scenario,
        });

        throw new Error(
          `Scenario not found for conversation ${conversation.id}`,
        );
      }

      const persona = await this.databaseService.getPersonaById(
        accountId,
        conversation.persona,
      );

      if (!persona) {
        this.logger.warn({
          fn: function_,
          message: `No persona found for conversation ${conversation.id}, skipping analysis`,
          accountId,
          conversationId: conversation.id,
          personaId: conversation.persona,
        });

        throw new Error(
          `Persona not found for conversation ${conversation.id}`,
        );
      }

      // Get conversation details from CC
      const conversationInfo =
        await this.conversationCloudService.getConversationInfo(
          accountId,
          token,
          conversation?.id,
        );

      if (!conversationInfo?.filtered || !conversationInfo?.transcript) {
        this.logger.warn({
          fn: function_,
          message: `No conversation details found for conversation ${conversation.id}, skipping analysis`,
          accountId,
          conversationId: conversation.id,
        });

        throw new Error(
          `Conversation details not found for conversation ${conversation.id}`,
        );
      }

      const { filtered, transcript } = conversationInfo;

      console.info('filtered conversation info:', filtered);
      // Build conversation details string
      let conversation_details = '';

      const toInclude = [
        'closeReason',
        'startTimeL',
        'endTimeL',
        'duration',
        'latestAgentFullName',
        'latestSkillName',
        'mcs',
        'mcsTrend',
      ];

      for (const [key, value] of Object.entries(filtered)) {
        if (value && toInclude.includes(key)) {
          conversation_details += `${key}: ${value}\n`;
        }
      }

      const closeReason = filtered?.closeReason || 'unknown';

      // Construct prompt and get assessment from AI Studio
      const prompt = fillPrompt(basePrompt, {
        transcript,
        conversation_details,
        scenario,
        persona,
        brand_name: task.brandName,
        closeReason,
      });

      if (!prompt) {
        throw new Error(
          `Failed to construct prompt for conversation ${conversation.id}`,
        );
      }

      const assessment = await this.aiStudioService.getFlowResponse({
        accountId,
        conv_id: conversation.aisConversationId,
        flow_id: conversation.flowId,
        token: insertCCBearer(token),
        prompt,
        messages: conversation.messages || [],
      });

      // Build updated conversation object, only including survey fields if they have valid values
      const updates: any = {
        assessment: helper.findJSON(assessment?.text),
        mcs: filtered.mcs,
        duration: filtered.duration,
      };

      // Add survey fields only if they have valid values
      this.addSurveyFieldsToUpdates(
        updates,
        (filtered as any).conversationSurveys,
      );

      // Update metadata if not already present
      if (!conversation.metadata) {
        const metadata: any = Object.assign({}, filtered, {
          personalInfo: getPersonalInfoSde((filtered as any).sdes),
          customerInfo: getCustomerInfoSdes((filtered as any).sdes),
        });

        // Only add feedback if it has a valid value
        const feedback = getSurveyAnswer(
          (filtered as any).conversationSurveys,
          'feedback',
        );

        if (feedback !== null && feedback !== undefined && feedback !== '') {
          metadata.feedback = feedback;
        }

        updates.metadata = metadata;
      }

      const updatedConversation = Object.assign(
        Object.create(Object.getPrototypeOf(conversation)),
        conversation,
        updates,
      );

      console.info('Updated conversation after analysis:', updatedConversation);

      // Update the conversation in both cache and database
      await Promise.all([
        this.databaseService.updateConversation(
          accountId,
          conversation.id,
          updatedConversation,
        ),
        this.cache.updateConversation(
          accountId,
          conversation.id,
          updatedConversation,
        ),
      ]);

      return updatedConversation;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error analyzing individual conversation ${conversation.id}`,
        accountId,
        conversationId: conversation.id,
        error: error.message || error,
      });

      throw error;
    }
  }

  async concludeTask(
    accountId: string,
    task: TaskStatus,
    _conversations?: SimulationConversation[],
  ): Promise<TaskStatus> {
    const function_ = 'concludeTask';

    try {
      const token = await this.validateAndGetToken(task);

      const conversations =
        _conversations ||
        (await this.cache.getConversationsByRequestId(
          accountId,
          task.requestId,
        ));

      // Enrich conversations with CC metadata
      await this.enrichConversationsWithMetadata(
        accountId,
        task,
        token,
        conversations,
      );

      // Analyze all conversations individually
      const analysedConversations = await this.performConversationAnalysis(
        accountId,
        task,
        conversations,
        token,
      );

      // Extract unique agents
      const uniqueAgents = this.extractUniqueAgents(
        analysedConversations,
        task.requestId,
        accountId,
      );

      const agentPerformance = await this.analyseAgentPerformanceForAllAgents(
        task,
        token,
        analysedConversations,
        uniqueAgents,
      );

      task.agentProfiles = agentPerformance || [];

      await this.databaseService.updateTask(accountId, task.requestId, {
        status: SIMULATION_STATUS.OVERALL_ANALYSIS,
        agentProfiles: task.agentProfiles,
        updatedAt: Date.now(),
      });

      const scenarioAnalysis = this.analyseScenarios(analysedConversations);

      const overallPerformance = await this.analyseTask(
        accountId,
        task,
        analysedConversations,
        agentPerformance
          .map((agent) =>
            Object.entries(agent)
              .map(([key, value]) => `${key}: ${value}`)
              .join('\n'),
          )
          .join('\n\n'),
        uniqueAgents.length,
      );

      await this.databaseService.updateTask(
        accountId,
        task.requestId,
        {
          ...overallPerformance,
          status: SIMULATION_STATUS.COMPLETED,
          updatedAt: Date.now(),
          // scenarioAnalysis,
        },
        [],
      );

      return Object.assign({}, task, overallPerformance, scenarioAnalysis, {
        status: SIMULATION_STATUS.COMPLETED,
      });
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error concluding task for account ${task.accountId}: ${error}`,
        accountId: task.accountId,
      });

      await this.databaseService.updateTask(accountId, task.requestId, {
        updatedAt: Date.now(),
        status: SIMULATION_STATUS.ERROR,
      });

      this.logger.error({
        fn: function_,
        message: `Task (${task?.name}) ${task.requestId} for account ${task.accountId} concluded with error`,
        error,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `Error concluding task for account ${task.accountId}`,
          error.toString(),
          `task: ${task.name || task.requestId}`,
        ),
      );
    }
  }

  /**
   * Gets conversations for an agent, either from provided data or database
   */
  private async getAgentConversations(
    accountId: string,
    agentId: number,
    providedConversations: SimulationConversation[] | undefined,
    functionName: string,
  ): Promise<SimulationConversation[]> {
    const conversations =
      providedConversations ||
      (await this.databaseService.getConversationsByLastAgentAssigned(
        accountId,
        agentId,
      ));

    if (!conversations || conversations.length === 0) {
      throw new InternalServerErrorException(
        ...context_(
          context,
          functionName,
          `No conversations found for account ${accountId} and agentId ${agentId}`,
        ),
      );
    }

    return conversations;
  }

  /**
   * Builds the initial agent profile with totals
   */
  private buildAgentProfile(
    agentId: number,
    conversations: SimulationConversation[],
  ): AgentProfile {
    return {
      id: agentId,
      name: conversations[0].latestAgentFullName || '',
      totals: this.calculateTotals(conversations),
      averages: {},
      scenarios: {},
    };
  }

  /**
   * Calculates total metrics from conversations
   */
  private calculateTotals(
    conversations: SimulationConversation[],
  ): AgentProfile['totals'] {
    return {
      conversations: conversations.length,
      duration: conversations.reduce(
        (accumulator, conv) => accumulator + (conv.duration || 0),
        0,
      ),
      mcs: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.mcs === 'number' && !isNaN(conv.mcs) ? conv.mcs : 0),
        0,
      ),
      mcsCount: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.mcs === 'number' && !isNaN(conv.mcs) ? 1 : 0),
        0,
      ),
      csat: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.csat === 'number' && !isNaN(conv.csat) ? conv.csat : 0),
        0,
      ),
      csatCount: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.csat === 'number' && !isNaN(conv.csat) ? 1 : 0),
        0,
      ),
      nps: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.nps === 'number' && !isNaN(conv.nps) ? conv.nps : 0),
        0,
      ),
      npsCount: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.nps === 'number' && !isNaN(conv.nps) ? 1 : 0),
        0,
      ),
      fcr: conversations.reduce((accumulator, conv) => {
        if (typeof conv.fcr !== 'boolean') return accumulator;

        return accumulator + (conv.fcr ? 1 : 0);
      }, 0),
      fcrCount: conversations.reduce(
        (accumulator, conv) =>
          accumulator + (typeof conv.fcr === 'boolean' ? 1 : 0),
        0,
      ),
      ai_score: conversations.reduce(
        (accumulator, conv) =>
          accumulator +
          (typeof conv.assessment?.score === 'number' &&
          !isNaN(conv.assessment?.score)
            ? conv.assessment.score
            : 0),
        0,
      ),
      ai_scoreCount: conversations.reduce(
        (accumulator, conv) =>
          accumulator + (typeof conv.assessment?.score === 'number' ? 1 : 0),
        0,
      ),
      turns: conversations.reduce(
        (accumulator, conv) => accumulator + (conv.agentTurns || 0),
        0,
      ),
    };
  }

  /**
   * Calculates average metrics from totals
   */
  private calculateAverages(
    totals: AgentProfile['totals'],
  ): AgentProfile['averages'] {
    return {
      mcs: totals.mcsCount > 0 ? totals.mcs / totals.mcsCount : 0,
      csat: totals.csatCount > 0 ? totals.csat / totals.csatCount : 0,
      nps: totals.npsCount > 0 ? totals.nps / totals.npsCount : 0,
      fcr: totals.fcrCount > 0 ? totals.fcr / totals.fcrCount : 0,
      duration:
        totals.conversations > 0 ? totals.duration / totals.conversations : 0,
      ai_score:
        totals.ai_scoreCount > 0 ? totals.ai_score / totals.ai_scoreCount : 0,
      turns: totals.conversations > 0 ? totals.turns / totals.conversations : 0,
    };
  }

  /**
   * Builds scenario performance map from conversations
   */
  private buildScenarioMap(
    conversations: SimulationConversation[],
  ): Record<string, ScenarioPerformanceMetrics> {
    const scenarioMap: Record<string, ScenarioPerformanceMetrics> = {};

    for (const conv of conversations) {
      if (!conv.scenario) continue;

      this.initializeScenarioMetrics(scenarioMap, conv);
      this.updateScenarioMetrics(scenarioMap, conv);
    }

    // Finalize averages for each scenario
    this.finalizeScenarioAverages(scenarioMap);

    return scenarioMap;
  }

  /**
   * Initializes scenario metrics if not exists
   */
  private initializeScenarioMetrics(
    scenarioMap: Record<string, ScenarioPerformanceMetrics>,
    conv: SimulationConversation,
  ): void {
    const scenarioId = conv.scenario;

    if (!scenarioId) return;

    if (!Object.prototype.hasOwnProperty.call(scenarioMap, scenarioId)) {
      Object.defineProperty(scenarioMap, scenarioId, {
        value: {
          scenarioId,
          scenarioName: conv.scenarioName || 'Unknown Scenario',
          conversations: 0,
          mcs: 0,
          mcsCount: 0,
          csat: 0,
          csatCount: 0,
          nps: 0,
          npsCount: 0,
          fcr: 0,
          fcrCount: 0,
          duration: 0,
          avg_ai_score: 0,
          avg_ai_scoreCount: 0,
          turns: 0,
          ai_assessment: '',
        },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  /**
   * Updates scenario metrics with conversation data
   */
  private updateScenarioMetrics(
    scenarioMap: Record<string, ScenarioPerformanceMetrics>,
    conv: SimulationConversation,
  ): void {
    const scenarioId = conv.scenario;

    if (!scenarioId) return;

    const descriptor = Object.getOwnPropertyDescriptor(scenarioMap, scenarioId);
    const scenario = descriptor?.value;

    if (!scenario) return;

    // Update scenario name if available
    if (conv.scenarioName && !scenario.scenarioName) {
      scenario.scenarioName = conv.scenarioName;
    }

    // Add AI assessment
    this.addAssessmentToScenario(scenario, conv);

    // Accumulate numeric metrics
    this.accumulateScenarioMetrics(scenario, conv);

    // Increment conversation count
    scenario.conversations += 1;
  }

  /**
   * Adds AI assessment text to scenario
   */
  private addAssessmentToScenario(
    scenario: ScenarioPerformanceMetrics,
    conv: SimulationConversation,
  ): void {
    if (!conv.assessment) return;

    const assessmentText =
      typeof conv.assessment === 'object'
        ? objectToText(conv.assessment, 0, 3)
        : String(conv.assessment);

    if (assessmentText?.trim()) {
      scenario.ai_assessment +=
        (scenario.ai_assessment ? '\n' : '') + assessmentText;
    }
  }

  /**
   * Accumulates numeric metrics for scenario
   */
  private accumulateScenarioMetrics(
    scenario: ScenarioPerformanceMetrics,
    conv: SimulationConversation,
  ): void {
    if (typeof conv.mcs === 'number' && !isNaN(conv.mcs)) {
      scenario.mcs += conv.mcs;
      scenario.mcsCount += 1;
    }

    if (typeof conv.csat === 'number' && !isNaN(conv.csat)) {
      scenario.csat += conv.csat;
      scenario.csatCount += 1;
    }

    if (typeof conv.nps === 'number' && !isNaN(conv.nps)) {
      scenario.nps += conv.nps;
      scenario.npsCount += 1;
    }

    if (typeof conv.fcr === 'boolean') {
      scenario.fcr += conv.fcr ? 1 : 0;
      scenario.fcrCount += 1;
    }

    if (typeof conv.duration === 'number' && !isNaN(conv.duration)) {
      scenario.duration += conv.duration;
    }

    if (
      typeof conv.assessment?.score === 'number' &&
      !isNaN(conv.assessment.score)
    ) {
      scenario.avg_ai_score += conv.assessment.score;
      scenario.avg_ai_scoreCount += 1;
    }

    if (typeof conv.agentTurns === 'number' && !isNaN(conv.agentTurns)) {
      scenario.turns += conv.agentTurns;
    }
  }

  /**
   * Finalizes scenario averages by converting accumulated sums to averages
   */
  private finalizeScenarioAverages(
    scenarioMap: Record<string, ScenarioPerformanceMetrics>,
  ): void {
    for (const scenarioId in scenarioMap) {
      if (!Object.prototype.hasOwnProperty.call(scenarioMap, scenarioId)) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        scenarioMap,
        scenarioId,
      );

      if (!descriptor?.value) continue;

      this.calculateAndAssignScenarioAverages(descriptor.value);
    }
  }

  /**
   * Calculates and assigns averages for a single scenario
   */
  private calculateAndAssignScenarioAverages(
    scenario: ScenarioPerformanceMetrics,
  ): void {
    // Calculate metrics with count-based division
    this.assignMetricWithAverage(scenario, 'mcs', 'mcsCount', 'mcs_avg');
    this.assignMetricWithAverage(scenario, 'csat', 'csatCount', 'csat_avg');
    this.assignMetricWithAverage(scenario, 'nps', 'npsCount', 'nps_avg');
    this.assignMetricWithAverage(scenario, 'fcr', 'fcrCount', 'fcr_avg');

    // AI Score - special handling for legacy field names
    const aiScoreTotal = scenario.avg_ai_score;
    const aiScoreCount = scenario.avg_ai_scoreCount;
    const aiScoreAvg = aiScoreCount > 0 ? aiScoreTotal / aiScoreCount : null;

    scenario.ai_score = aiScoreTotal;
    scenario.ai_score_count = aiScoreCount;
    scenario.ai_score_avg = aiScoreAvg;

    // Calculate conversation-based averages
    this.assignConversationBasedAverage(scenario, 'duration', 'duration_avg');
    this.assignConversationBasedAverage(scenario, 'turns', 'turns_avg');
  }

  /**
   * Assigns total, count, and average for a metric
   */
  private assignMetricWithAverage(
    scenario: ScenarioPerformanceMetrics,
    totalKey: string,
    countKey: string,
    avgKey: string,
  ): void {
    const total = scenario[totalKey];
    const count = scenario[countKey];
    const avg = count > 0 ? total / count : null;

    scenario[totalKey] = total;
    scenario[countKey] = count;
    scenario[avgKey] = avg;
  }

  /**
   * Assigns total and conversation-based average for a metric
   */
  private assignConversationBasedAverage(
    scenario: ScenarioPerformanceMetrics,
    totalKey: string,
    avgKey: string,
  ): void {
    const total = scenario[totalKey];
    const avg = scenario.conversations > 0 ? total / scenario.conversations : 0;

    scenario[totalKey] = total;
    scenario[avgKey] = avg;
  }

  async createAgentProfile(
    accountId: string,
    agentId: number,
    _conversations?: SimulationConversation[],
  ): Promise<AgentProfile | null> {
    const function_ = 'createAgentProfile';

    try {
      const conversations = await this.getAgentConversations(
        accountId,
        agentId,
        _conversations,
        function_,
      );

      const agentProfile = this.buildAgentProfile(agentId, conversations);

      agentProfile.averages = this.calculateAverages(agentProfile.totals);
      agentProfile.scenarios = this.buildScenarioMap(conversations);

      this.logger.debug({
        fn: function_,
        message: 'Scenario map processed',
        scenarioMap: agentProfile.scenarios,
        accountId,
        agentId,
      });

      return agentProfile;
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: `Error creating agent profile for account ${accountId}: ${error}`,
        accountId,
      });

      throw new InternalServerErrorException(
        ...context_(
          context,
          function_,
          `Error creating agent profile for account ${accountId}`,
          error.toString(),
        ),
      );
    }
  }

  async concludeTaskById(
    accountId: string,
    requestId: string,
  ): Promise<TaskStatus> {
    const task = await this.databaseService.getTask(accountId, requestId);

    if (!task) {
      throw new NotFoundException(`Task with ID ${requestId} not found`);
    }

    // Perform any necessary analysis or processing on the task
    const taskConversations =
      await this.databaseService.getConversationsByTaskId(accountId, requestId);

    if (!taskConversations || taskConversations.length === 0) {
      this.logger.warn(
        `No conversations found for task ${requestId} of account ${accountId}`,
      );

      return task;
    }

    await this.concludeTask(accountId, task, taskConversations || []);

    return task;
  }

  // concludeTask is a secret function that allows us to analyse a simulation task from an API call.
  // the following function is the same, but we will just analyse a single conversation and return the analysis.
  async analyseConversationById(
    accountId: string,
    conversationId: string,
  ): Promise<SimulationConversation> {
    const conversation = await this.getConversationFromCache(
      accountId,
      conversationId,
      'analyseConversationById',
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    const task = await this.databaseService.getTask(
      accountId,
      conversation.requestId,
    );

    if (!task) {
      throw new NotFoundException(
        `Task with ID ${conversation.requestId} not found`,
      );
    }

    const token = await this.validateAndGetToken(task);

    const promptId = task?.prompts?.conversationAssessment;

    if (!promptId) {
      throw new InternalServerErrorException(
        `No conversation assessment promptId found for task ${task.requestId}`,
      );
    }

    const basePrompt = await this.databaseService.getPrompt(
      accountId,
      promptId,
      true, // attempt to get from cache
    );

    if (!basePrompt) {
      throw new InternalServerErrorException(
        `No conversation assessment prompt found for task ${task.requestId}`,
      );
    }

    const analysedConversation = await this.analyzeIndividualConversation(
      accountId,
      task,
      conversation,
      token,
      basePrompt,
      true,
    );

    return analysedConversation;
  }

  /**
   * Validates task and retrieves authentication token
   */
  private async validateAndGetToken(task: TaskStatus): Promise<string> {
    if (!task) {
      throw new InternalServerErrorException(
        ...context_(
          context,
          'validateAndGetToken',
          `No task found for account ${task?.accountId}`,
        ),
      );
    }

    const token = await this.appConfigService.getTokenWithFallback(
      task.accountId,
    );

    if (!token) {
      throw new InternalServerErrorException(
        ...context_(
          context,
          'validateAndGetToken',
          `No token found for account ${task.accountId}`,
        ),
      );
    }

    return token;
  }

  /**
   * Enriches conversations with metadata from Conversational Cloud
   */
  private async enrichConversationsWithMetadata(
    accountId: string,
    task: TaskStatus,
    token: string,
    conversations: SimulationConversation[],
  ): Promise<void> {
    const ccDataArray =
      await this.conversationCloudService.getConversationsByIds(
        token,
        accountId,
        conversations.map((c) => c.id),
        task?.requestId,
      );

    for (const cd of ccDataArray) {
      const conversationId = cd.info.conversationId;
      const conversation = conversations.find((c) => c.id === conversationId);

      if (!conversation) continue;

      const metadata = this.buildConversationMetadata(cd);

      conversation.metadata = metadata;
      this.updateConversationMetrics(conversation, metadata);
    }
  }

  /**
   * Builds metadata object from CC conversation data
   * Only includes survey fields (csat, nps, fcr, feedback) if they have valid values
   */
  private buildConversationMetadata(cd: any): any {
    const metadata: any = {
      messages: [],
      participantId: cd?.consumerParticipants?.[0]?.participantId || '',
      conversationId: cd?.info?.conversationId || '',
      closeReason: cd?.info?.closeReason || '',
      closeReasonDescription: cd?.info?.closeReasonDescription || '',
      startTimeL: cd?.info?.startTimeL,
      endTimeL: cd?.info?.endTimeL,
      duration: cd?.info?.duration,
      latestAgentId: cd?.info?.latestAgentId,
      latestAgentNickname: cd?.info?.latestAgentNickname,
      latestAgentFullName: cd?.info?.latestAgentFullName,
      latestSkillId: cd?.info?.latestSkillId,
      latestSkillName: cd?.info?.latestSkillName,
      mcs: cd?.info?.mcs,
      status: cd?.info?.status as CONVERSATION_STATE,
      latestAgentGroupId: cd?.info?.latestAgentGroupId,
      latestAgentGroupName: cd?.info?.latestAgentGroupName,
      latestQueueState: cd?.info?.latestQueueState,
      mcsTrend: cd?.messageScores?.map((ms: any) => ms.mcs),
      conversationSurveys: cd?.conversationSurveys,
      personalInfo: getPersonalInfoSde(cd?.sdes),
      customerInfo: getCustomerInfoSdes(cd?.sdes),
    };

    // Only add survey fields if they have valid values
    const csat = getSurveyAnswer(cd?.conversationSurveys, 'csat');

    if (csat !== null && csat !== undefined) {
      metadata.csat = csat;
    }

    const nps = getSurveyAnswer(cd?.conversationSurveys, 'nps');

    if (nps !== null && nps !== undefined) {
      metadata.nps = nps;
    }

    const fcr = getSurveyAnswer(cd?.conversationSurveys, 'fcr');

    if (fcr !== null && fcr !== undefined) {
      metadata.fcr = fcr;
    }

    const feedback = getSurveyAnswer(cd?.conversationSurveys, 'feedback');

    if (feedback !== null && feedback !== undefined && feedback !== '') {
      metadata.feedback = feedback;
    }

    return metadata;
  }

  /**
   * Updates conversation metrics from metadata
   */
  private updateConversationMetrics(
    conversation: SimulationConversation,
    metadata: any,
  ): void {
    if (metadata.mcs) {
      conversation.mcs = metadata.mcs;
    }

    if (metadata.duration) {
      conversation.duration = metadata.duration;
    }

    if (metadata.nps) {
      conversation.nps = metadata.nps;
    }

    if (metadata.csat) {
      conversation.csat = metadata.csat;
    }

    if (metadata.fcr !== undefined) {
      conversation.fcr = metadata.fcr ? 1 : 0;
    }
  }

  /**
   * Performs conversation analysis and logs progress
   */
  private async performConversationAnalysis(
    accountId: string,
    task: TaskStatus,
    conversations: SimulationConversation[],
    token: string,
  ): Promise<SimulationConversation[]> {
    const analysedConversations = await this.analyzeAllConversations(
      accountId,
      task,
      conversations,
      token,
    );

    return analysedConversations;
  }

  /**
   * Extracts unique agents from analyzed conversations
   */
  private extractUniqueAgents(
    conversations: SimulationConversation[],
    taskId: string,
    accountId: string,
  ): SimulationConversation[] {
    const uniqueAgentsMap = new Map<string, SimulationConversation>();

    conversations
      .filter(
        (c): c is SimulationConversation =>
          !!c.metadata?.latestAgentId && !!c.metadata?.latestAgentFullName,
      )
      .forEach((conversation) => {
        const agentId = conversation.metadata.latestAgentId;

        if (!uniqueAgentsMap.has(agentId)) {
          uniqueAgentsMap.set(agentId, conversation);
        }
      });

    const uniqueAgents = Array.from(uniqueAgentsMap.values());

    return uniqueAgents;
  }
}
