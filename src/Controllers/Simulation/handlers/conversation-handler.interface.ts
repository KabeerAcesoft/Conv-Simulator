import { SimulationConversation, TaskStatus } from '../simulation.dto';

export interface MessageResponse {
  text: string;
  speaker: string;
  time: number;
  id: string;
  personaId?: string;
  scenarioId?: string;
}

export interface ConversationCreationResult {
  conversationId: string;
  aisConversationId: string;
  firstMessage: MessageResponse;
}

export interface IConversationHandler {
  /**
   * Creates a new conversation for the specific source type
   */
  createConversation(task: TaskStatus): Promise<string | null>;

  /**
   * Generates the first response for a newly created conversation
   */
  getFirstResponse(
    task: TaskStatus,
    conversationId: string,
    aisConversationId: string,
    ...arguments_: any[]
  ): Promise<MessageResponse | null>;

  /**
   * Generates subsequent messages during the conversation
   */
  generateMessage(
    task: TaskStatus,
    conversation: Partial<SimulationConversation>,
    message: string,
  ): Promise<MessageResponse>;
}
