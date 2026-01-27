import { AISMessage } from './ai-studio.dto';

export const createPromptlessFlow = (parameters: {
  conv_id: string;
  flow_id: string | null;
  messages: AISMessage[];
  prompt: string;
  text?: string | null;
}) => {
  const { prompt, flow_id, conv_id, text, messages } = parameters;

  const flow = {
    display_name: 'CONVERSATION_SIMULATOR',
    version: 1,
    public: true,
    status: 'ACTIVE',
    template: false,
    template_group: 'community',
    use_case: null,
    cloned_from: null,
    cb_tile_metadata: null,
    description:
      'Base AI Langhcain flow to manage the prompts required for the Synthetic Customer Orchestrator',
    agent_widget_enabled: false,
    agent_widget_skills: [],
    nodes: [
      {
        id: 'LPLLMGateway-t7qCex',
        type: 'LPLLMGateway',
        data: {
          cohere_model_name: { show: true, value: 'command' },
          llm_provider: { show: true, value: 'openai-azure' },
          openai_azure_model_name: {
            show: true,
            value: 'gpt-4o-2024-11-20',
          },
          top_p: { show: false, value: 1 },
          subscription_name: { show: true, value: 'lp-ptu-gpt-4o' },
          api_version: { show: false, value: '2024-02-15-preview' },
          llm_mode: { show: true, value: 'chat' },
          max_tokens: { show: false, value: '2000' },
          temperature: { show: false, value: 0 },
          openai_model_name: { show: true, value: 'gpt-3.5-turbo' },
        },
        position: { x: 1602.106342072543, y: -139.84707909741644 },
        base_type: 'llm',
        disabled: false,
      },
      {
        // eslint-disable-next-line no-secrets/no-secrets
        id: 'LPContextualMemory-XkHhTl',
        type: 'LPContextualMemory',
        data: {
          dynamic_vars_key_map: {
            show: true,
            value: {
              current_time: {
                dynamic_var_name: 'current_datetime',
                test_value: '',
              },
            },
          },
          static_vars_key_map: { show: true, value: {} },
          context_vars_key_map: {
            show: true,
            value: {
              prompt: {
                secure_context_var: 'botContext.prompt',
                test_value: 'name: Mike Wallace',
              },
            },
          },
          conversational_slot_key_list: { show: false, value: '' },
          max_turns: { show: false, value: -1 },
          conversational_slot_key_map: { show: true, value: {} },
          llm: { show: false, value: null },
        },
        position: { x: 2402.547809544913, y: 140.66720867265713 },
        base_type: 'memory',
        disabled: false,
      },
      {
        id: 'LLMChain-8S0IbK',
        type: 'LLMChain',
        data: {
          prompt: { show: true, value: null },
          save_output: { show: false, value: false },
          llm: { show: true, value: null },
          memory: { show: true, value: null },
          json_mode: { show: false, value: false },
          output_key: { show: false, value: 'output' },
          name: { show: true, value: 'CONTEXT' },
        },
        position: { x: 2796.951234373594, y: -256.9099765804483 },
        base_type: 'chain',
        disabled: false,
      },
      {
        id: 'LPPrompt-8OWzHc',
        type: 'LPPrompt',
        data: {
          prompt_input_choice: { show: true, value: 'Raw Prompt' },
          template: { show: true, value: '{prompt}\nPRIMER: {primer}' },
          template_role: { show: false, value: 'System' },
          include_chat_history: { show: false, value: true },
          memory_key: { show: false, value: 'chat_history' },
          prompt_library_id: { show: true, value: null },
          prompt_library_version: { show: true, value: '' },
          input_variables: { show: false, value: 'prompt, primer' },
          user_msg_role: { show: false, value: 'Consumer' },
          include_user_msg: { show: false, value: true },
        },
        position: { x: 2064.951234373594, y: -530.9099765804481 },
        base_type: 'prompt',
        disabled: false,
      },
    ],
    edges: [
      {
        id: 'Edge-Gn67Wp',
        source: 'LPLLMGateway-t7qCex',
        target: 'LLMChain-8S0IbK',
        sourceHandle: 'output',
        targetHandle: 'llm',
        disabled: false,
      },
      {
        id: 'Edge-m5UiaA',
        source: 'LPPrompt-8OWzHc',
        target: 'LLMChain-8S0IbK',
        sourceHandle: 'output',
        targetHandle: 'prompt',
        disabled: false,
      },
      {
        id: 'Edge-Qf15Cz',
        // eslint-disable-next-line no-secrets/no-secrets
        source: 'LPContextualMemory-XkHhTl',
        target: 'LLMChain-8S0IbK',
        sourceHandle: 'output',
        targetHandle: 'memory',
        disabled: false,
      },
    ],
    use_case_mapping: null,
    jobs: {},
  };

  const request = {
    flow,
    text: text || 'start',
    source: 'SIMULATION',
    save_answer: true,
    save_conv: true,
    engagement_attributes_in_response: true,
    debug: false,
    bot_context_vars: {
      prompt,
    },
  };

  if (conv_id) {
    Object.assign(request, {
      conv_id,
    });
  }

  if (flow_id) {
    Object.assign(request, {
      flow_id,
    });
  }

  if (messages) {
    Object.assign(request, {
      messages,
    });
  }

  return request;
};

export const createFlowRequestBody = (parameters: {
  conv_id: string;
  flow_id: string | null;
  messages?: AISMessage[];
  prompt: string;
  text?: string | null;
}) => {
  const { prompt, flow_id, conv_id, text, messages } = parameters;

  const request = {
    text: text || 'start',
    source: 'CONVERSATIONAL_CLOUD',
    save_answer: true,
    save_conv: true,
    engagement_attributes_in_response: true,
    debug: false,
    bot_context_vars: {
      prompt,
    },
  };

  if (conv_id) {
    Object.assign(request, {
      conv_id,
    });
  }

  if (flow_id) {
    Object.assign(request, {
      flow_id,
    });
  }

  if (messages) {
    Object.assign(request, {
      messages,
    });
  }

  return request;
};

export const usePromptlessFlow = (request: any, text: string) => {
  if (!request?.flow?.nodes || !request.request) {
    throw new Error('Invalid request format');
  }

  request.request.text = text;

  return request;
};
