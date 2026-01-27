import {
  ConversationSurvey,
  CustomerInfoSde,
  SDEs,
} from 'src/Controllers/ConversationalCloud/conversation-cloud.interfaces';
import { helper } from 'src/utils/HelperService';

import { AgentProfile, SimulationConversation } from '../simulation.dto';

export function getMCS(
  conversations: SimulationConversation[],
  fromMetadata?: boolean,
) {
  try {
    return (
      conversations
        .filter(
          (c): c is SimulationConversation =>
            typeof c !== 'string' &&
            (fromMetadata ? c?.metadata?.mcs !== null : c?.mcs !== null) &&
            (fromMetadata
              ? c?.metadata?.mcs !== undefined
              : c?.mcs !== undefined),
        )
        .map((c) => (fromMetadata ? c?.metadata?.mcs : c?.mcs))
        .reduce((a, b) => a + b, 0) /
      conversations.filter(
        (c): c is SimulationConversation =>
          typeof c !== 'string' &&
          (fromMetadata ? c?.metadata?.mcs !== null : c?.mcs !== null) &&
          (fromMetadata
            ? c?.metadata?.mcs !== undefined
            : c?.mcs !== undefined),
      ).length
    );
  } catch {
    return null;
  }
}

export function getCsat(
  conversations: SimulationConversation[],
  fromMetadata?: boolean,
) {
  try {
    return (
      conversations
        .filter(
          (c): c is SimulationConversation =>
            typeof c !== 'string' &&
            (fromMetadata ? c.metadata?.csat !== null : c?.csat !== null) &&
            (fromMetadata
              ? c.metadata?.csat !== undefined
              : c?.csat !== undefined),
        )
        .map((c) => (fromMetadata ? c.metadata?.csat : c?.csat))
        .reduce((a, b) => a + b, 0) /
      conversations.filter(
        (c): c is SimulationConversation =>
          typeof c !== 'string' &&
          (fromMetadata ? c.metadata?.csat !== null : c?.csat !== null) &&
          (fromMetadata
            ? c.metadata?.csat !== undefined
            : c?.csat !== undefined),
      ).length
    );
  } catch {
    return null;
  }
}

export function getNPS(
  conversations: SimulationConversation[],
  fromMetadata?: boolean,
) {
  try {
    return (
      conversations
        .filter(
          (c): c is SimulationConversation =>
            typeof c !== 'string' &&
            (fromMetadata ? c.metadata?.nps !== null : c?.nps !== null) &&
            (fromMetadata
              ? c.metadata?.nps !== undefined
              : c?.nps !== undefined),
        )
        .map((c) => (fromMetadata ? c.metadata?.nps : c?.nps))
        .reduce((a, b) => a + b, 0) /
      conversations.filter(
        (c): c is SimulationConversation =>
          typeof c !== 'string' &&
          (fromMetadata ? c.metadata?.nps !== null : c?.nps !== null) &&
          (fromMetadata ? c.metadata?.nps !== undefined : c?.nps !== undefined),
      ).length
    );
  } catch {
    return null;
  }
}

export function getFCR(
  conversations: SimulationConversation[],
  fromMetadata?: boolean,
) {
  // FCR is a boolean, so we need to convert it to 1 or 0
  try {
    const validConversations = conversations.filter(
      (c): c is SimulationConversation =>
        typeof c !== 'string' &&
        (fromMetadata ? c.metadata?.fcr !== null : c?.fcr !== null) &&
        (fromMetadata ? c.metadata?.fcr !== undefined : c?.fcr !== undefined),
    );

    const fcrValues = validConversations.map((c) => {
      const fcrValue = fromMetadata ? c.metadata?.fcr : c?.fcr;

      return fcrValue ? 1 : 0;
    });

    const sum = fcrValues.reduce((a, b) => a + b, 0);

    return sum / validConversations.length;
  } catch {
    return null;
  }
}

export function getAvgDuration(
  conversations: SimulationConversation[],
  fromMetadata?: boolean,
) {
  const durations = conversations
    .filter((c): c is SimulationConversation => {
      const duration = c.metadata?.duration;

      return typeof c !== 'string' && typeof duration === 'number';
    })
    .map((c) => (fromMetadata ? c.metadata?.duration : c?.duration));

  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  return avgDuration;
}

export function getAvgAIScore(agentConversations: SimulationConversation[]) {
  const AIScore = agentConversations
    .filter(
      (c): c is SimulationConversation =>
        typeof c.assessment?.score === 'number',
    )
    .map((c) => c.assessment?.score);

  const avgAIScore =
    AIScore.length > 0
      ? AIScore.reduce((a, b) => a + b, 0) / AIScore.length
      : null;

  const aiAssessments = agentConversations
    .filter(
      (c): c is SimulationConversation =>
        typeof c.assessment?.assessment === 'string',
    )
    .map((c) => c.assessment?.assessment);

  const ai_assessments =
    aiAssessments.length > 0
      ? aiAssessments.reduce((a, b) => a + '\n' + b, '')
      : null;

  return {
    avgAIScore,
    ai_assessments,
  };
}

export function getPersonalInfoSde(sdes: SDEs) {
  const personalInfoSde = sdes?.events?.find(
    (sde) => sde.sdeType === 'PERSONAL_INFO',
  );

  if (personalInfoSde) {
    return personalInfoSde.personalInfo?.personalInfo;
  }

  return null;
}

export function getSurveyAnswer(
  surveys: ConversationSurvey[],
  target: string,
): string | null {
  const sd = surveys?.length > 0 ? surveys[0] : null;

  if (!sd) {
    return null;
  }

  if (target === 'feedback') {
    const targetItem = sd?.surveyData?.find(
      (item) =>
        item.questionType === 'custom' &&
        item.questionFormat === 'open' &&
        item.question?.toLowerCase().includes('feedback'),
    );

    if (
      typeof targetItem?.answer !== 'undefined' &&
      targetItem.answer !== null
    ) {
      return targetItem.answer;
    }

    return null;
  }

  const targetItem = sd?.surveyData?.find(
    (item) => item.questionType === target,
  );

  if (typeof targetItem?.answer !== 'undefined' && targetItem.answer !== null) {
    if (target === 'fcr') {
      return String(Boolean(targetItem.answer));
    }

    const parsed = parseInt(targetItem.answer, 10);

    // If parseInt yields NaN, fall back to the raw string answer
    return Number.isNaN(parsed) ? targetItem.answer : String(parsed);
  }

  return null;
}

export const getCustomerInfoSdes = (sdes: SDEs) => {
  const SDE = sdes?.events?.find((sde) => sde.sdeType === 'CUSTOMER_INFO');
  const customerInfoSde: CustomerInfoSde = SDE?.customerInfo;

  if (customerInfoSde?.customerInfo) {
    return {
      customerStatus: customerInfoSde.customerInfo.customerStatus,
      customerType: customerInfoSde.customerInfo.customerType,
    };
  }

  return null;
};

export function agentProfileToText(agentProfile: AgentProfile) {
  let text = `Agent Name: ${agentProfile.name || 'Unknown'}\n`;

  text += `Agent ID: ${agentProfile.id}\n`;
  text += `Total Conversations: ${agentProfile.totals?.conversations || 0}\n\n`;

  /**
   * Overall Averages Section
   */
  text += '=== PERFORMANCE AVERAGES ===\n';
  const averages = agentProfile.averages || {};

  if (averages.mcs > 0)
    text += `  MCS (Meaningful Connection Score): ${averages.mcs.toFixed(2)}\n`;

  if (averages.csat > 0)
    text += `  CSAT (Customer Satisfaction): ${averages.csat.toFixed(2)}\n`;

  if (averages.nps > 0)
    text += `  NPS (Net Promoter Score): ${averages.nps.toFixed(2)}\n`;

  if (averages.fcr > 0)
    text += `  FCR (First Call Resolution): ${(averages.fcr * 100).toFixed(1)}%\n`;

  if (averages.duration > 0)
    text += `  Average Duration: ${Math.round(averages.duration)} seconds\n`;

  if (averages.ai_score > 0)
    text += `  AI Assessment Score: ${averages.ai_score.toFixed(2)}/10\n`;

  if (averages.turns > 0)
    text += `  Average Turns per Conversation: ${averages.turns.toFixed(1)}\n`;

  text += '\n';

  // Add agent-level AI assessment if available
  if (agentProfile.ai_assessment) {
    text += '=== OVERALL AI ASSESSMENT ===\n';
    const assessmentLines = agentProfile.ai_assessment.split('\n');

    assessmentLines.forEach((line) => {
      if (line.trim()) {
        text += `${line.trim()}\n`;
      }
    });

    text += '\n';
  }

  /**
   * Scenario Performance Section
   */
  const scenarios = agentProfile.scenarios || {};
  const scenarioKeys = Object.keys(scenarios);

  if (scenarioKeys.length > 0) {
    text += '=== SCENARIO PERFORMANCE ===\n';

    // Helper function for safe division with formatting
    const calcAvg = (total: number, count: number) =>
      count > 0 ? (total / count).toFixed(2) : 'N/A';

    const calcPercentage = (total: number, count: number) =>
      count > 0 ? ((total / count) * 100).toFixed(1) + '%' : 'N/A';

    scenarioKeys.forEach((scenarioId, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(scenarios, scenarioId);
      const scenario = descriptor?.value;

      if (!scenario) return;

      text += `\n${index + 1}. Scenario: ${scenario.scenarioName || 'Unknown Scenario'}\n`;
      text += `   Scenario ID: ${scenarioId}\n`;
      text += `   Total Conversations: ${scenario.conversations || 0}\n`;

      // Performance metrics for this scenario
      if (scenario.mcsCount > 0) {
        text += `   MCS: ${calcAvg(scenario.mcs, scenario.mcsCount)}\n`;
      }

      if (scenario.csatCount > 0) {
        text += `   CSAT: ${calcAvg(scenario.csat, scenario.csatCount)}\n`;
      }

      if (scenario.npsCount > 0) {
        text += `   NPS: ${calcAvg(scenario.nps, scenario.npsCount)}\n`;
      }

      if (scenario.fcrCount > 0) {
        text += `   FCR: ${calcPercentage(scenario.fcr, scenario.fcrCount)}\n`;
      }

      if (scenario.conversations > 0 && scenario.duration > 0) {
        text += `   Avg Duration: ${calcAvg(scenario.duration, scenario.conversations)} seconds\n`;
      }

      if (scenario.avg_ai_scoreCount > 0) {
        text += `   AI Score: ${calcAvg(scenario.avg_ai_score, scenario.avg_ai_scoreCount)}/10\n`;
      }

      if (scenario.conversations > 0 && scenario.turns > 0) {
        text += `   Avg Turns: ${calcAvg(scenario.turns, scenario.conversations)}\n`;
      }

      // Include AI assessment if available
      if (scenario.ai_assessment) {
        text += `   AI Assessment:\n`;
        // Format the assessment with proper indentation
        const assessmentLines = scenario.ai_assessment.split('\n');

        assessmentLines.forEach((line) => {
          if (line.trim()) {
            text += `     ${line.trim()}\n`;
          }
        });
      }
    });
  } else {
    text += '=== SCENARIO PERFORMANCE ===\n';
    text += 'No scenario data available.\n';
  }

  return text;
}

/**
 * Handles string inputs that might contain JSON
 */
function handleStringInput(
  object: string,
  indent: number,
  maxDepth: number,
): string {
  const isObject = helper.findJSON(object);

  if (isObject && typeof isObject === 'object') {
    return objectToText(isObject, indent, maxDepth);
  }

  return object;
}

/**
 * Converts an array to text representation
 */
function arrayToText(
  array: any[],
  indent: number,
  maxDepth: number,
  indentation: string,
): string {
  if (array.length === 0) {
    return '[]';
  }

  let text = '';

  for (let index = 0; index < array.length; index++) {
    const value = array.at(index);

    if (typeof value === 'object' && value !== null) {
      text += `${indentation}[${index}]:\n`;
      text += objectToText(value, indent + 2, maxDepth);
    } else {
      text += `${indentation}[${index}]: ${objectToText(value, 0, maxDepth)}\n`;
    }
  }

  return text;
}

/**
 * Checks if an array is simple (contains only primitives)
 */
function isSimpleArray(array: any[]): boolean {
  return array.every((item) => typeof item !== 'object' || item === null);
}

/**
 * Formats an array value for object property
 */
function formatArrayValue(
  key: string,
  value: any[],
  indent: number,
  maxDepth: number,
  indentation: string,
): string {
  if (value.length === 0) {
    return `${indentation}${key}: []\n`;
  }

  if (isSimpleArray(value)) {
    const items = value
      .map((v) => (v === null ? 'null' : String(v)))
      .join(', ');

    return `${indentation}${key}: [${items}]\n`;
  }

  // Complex array - display nested
  const nestedText = objectToText(value, indent + 2, maxDepth);

  return `${indentation}${key}:\n` + nestedText;
}

/**
 * Formats a single object property
 */
function formatObjectProperty(
  key: string,
  value: any,
  indent: number,
  maxDepth: number,
  indentation: string,
): string {
  if (value === null) {
    return `${indentation}${key}: null\n`;
  }

  if (value === undefined) {
    return `${indentation}${key}: undefined\n`;
  }

  if (Array.isArray(value)) {
    return formatArrayValue(key, value, indent, maxDepth, indentation);
  }

  if (typeof value === 'object') {
    const nestedText = objectToText(value, indent + 2, maxDepth);

    return `${indentation}${key}:\n` + nestedText;
  }

  return `${indentation}${key}: ${value}\n`;
}

/**
 * Converts an object to text representation
 */
function plainObjectToText(
  object: any,
  indent: number,
  maxDepth: number,
  indentation: string,
): string {
  const keys = Object.keys(object);

  if (keys.length === 0) {
    return '{}';
  }

  let text = '';

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const value = descriptor?.value;

      text += formatObjectProperty(key, value, indent, maxDepth, indentation);
    }
  }

  return text;
}

export function objectToText(object: any, indent = 0, maxDepth = 5): string {
  // Handle string inputs that might contain JSON
  if (typeof object === 'string') {
    return handleStringInput(object, indent, maxDepth);
  }

  // Prevent infinite recursion
  if (indent > maxDepth * 2) {
    return '[Max depth reached]';
  }

  // Handle null or undefined
  if (object === null) return 'null';

  if (object === undefined) return 'undefined';

  // Handle primitive types
  if (typeof object !== 'object') {
    return String(object);
  }

  const indentation = ' '.repeat(indent);

  // Handle arrays
  if (Array.isArray(object)) {
    return arrayToText(object, indent, maxDepth, indentation);
  }

  // Handle objects
  return plainObjectToText(object, indent, maxDepth, indentation);
}
