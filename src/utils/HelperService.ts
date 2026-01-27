import { ConfigService } from '@nestjs/config';

import { Transform, TransformFnParams } from 'class-transformer';
import crypto from 'crypto';
import { htmlToText } from 'html-to-text';
import * as moment from 'moment';
import OAuth from 'oauth-1.0a';

import { MESSAGE_TYPES } from 'src/constants/constants';
import { UserDto } from 'src/Controllers/AccountConfig/account-config.dto';
import {
  ConversationSurvey,
  CustomerInfoSde,
  MessageData,
  MessageDataRich,
  MessageRecord,
  MessageScore,
  SDEs,
} from 'src/Controllers/ConversationalCloud/conversation-cloud.interfaces';
import {
  ConversationMetadata,
  SimulationConversation,
} from 'src/Controllers/Simulation/simulation.dto';
import { decrypt, encrypt } from 'src/utils/encryption';

import { returnTZ } from './timezones';

interface ApiKeyBasic {
  keyId: string;
  appSecret: string;
  token: string;
  tokenSecret: string;
}

export class HelperService {
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }
  createTaskName(user: UserDto) {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const day = new Date().getDate();
    const date = `${year}-${month}-${day}`;
    const taskName = `${user.id}-${date}`;

    return taskName;
  }
  delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  ctx = (
    controller: string,
    functionName: string,
    message: object | string,
    accountId?: string,
  ) => {
    const c = controller.replace(/\[/, '').replace(/\]/, '');
    const f = functionName.replace(/\[/, '').replace(/\]/, '');
    const _ac = accountId ? `[${accountId}]` : '';

    return [`${_ac}[${c}][${f}]:`, message];
  };

  lastValueInArray = (array: any[]): any => {
    if (!Array.isArray(array) || array.length === 0) {
      return null; // Return null if the array is empty or not an array
    }

    return array[array.length - 1]; // Return the last value in the array
  };

  insertBearer(token: string) {
    const a = token.replace('Bearer', '').trim();

    return `Bearer ${a}`;
  }

  insertCCBearer(token: string) {
    const t = token.includes(' ') ? token.split(' ')[1] : token;
    const aisToken = `CC-Bearer ${t}`;

    return aisToken;
  }

  createConversationalContext(zone: string) {
    const ipAddress = () => {
      const ipAddress = crypto.randomBytes(4).toString('hex');

      return `${ipAddress}.${ipAddress}.${ipAddress}.${ipAddress}`;
    };

    const deviceFamily = ['DESKTOP', 'TABLET', 'MOBILE', 'OTHER'];
    const os = ['WINDOWS', 'ANDROID', 'IOS', 'OSX', 'OTHER'];

    const randomDeviceFamily = () => {
      // eslint-disable-next-line sonarjs/pseudo-random
      const randomIndex = Math.floor(Math.random() * deviceFamily.length);

      // eslint-disable-next-line security/detect-object-injection
      return deviceFamily[randomIndex];
    };

    const randomOs = () => {
      // eslint-disable-next-line sonarjs/pseudo-random
      const randomIndex = Math.floor(Math.random() * os.length);

      // eslint-disable-next-line security/detect-object-injection
      return os[randomIndex];
    };

    const randomAppId = () => {
      const appId = crypto.randomBytes(4).toString('hex');

      return `webAsync-${appId}`;
    };

    const randomAppVersion = () => {
      const appVersion = crypto.randomBytes(4).toString('hex');

      return `1.0.${appVersion}`;
    };

    const randomOsVersion = () => {
      const osVersion = crypto.randomBytes(4).toString('hex');

      return `10.0.${osVersion}`;
    };

    const randomBrowser = () => {
      const browser = crypto.randomBytes(4).toString('hex');

      return `chrome-${browser}`;
    };

    const randomBrowserVersion = () => {
      const browserVersion = crypto.randomBytes(4).toString('hex');

      return `127.0.0.${browserVersion}`;
    };

    const payload = {
      timeZone: returnTZ(zone),
      type: '.ams.headers.ClientProperties',
      appId: randomAppId(),
      appVersion: randomAppVersion(),
      ipAddress: ipAddress(),
      deviceFamily: randomDeviceFamily(),
      os: randomOs(),
      osVersion: randomOsVersion(),
      browser: randomBrowser(),
      browserVersion: randomBrowserVersion(),
      features: [
        'CO_BROWSE',
        'CO_APP',
        'PHOTO_SHARING',
        'SECURE_FORMS',
        'AUTO_MESSAGES',
        'RICH_CONTENT',
      ],
    };

    return payload;
  }

  richToPlain(event: any): string {
    const response = {
      isPlain: false,
      message: event.message,
    };

    try {
      const { quickReplies, message } = event;

      // console.info('************************************************');
      // console.info('Original Rich Message:', event);
      // console.info('************************************************');
      const optionText = '\nselect from the following options:\n';
      const options = [];
      const replies = quickReplies?.replies;

      if (replies?.length) {
        replies.forEach((reply: any) => {
          const action = reply.click?.actions.find(
            (action: any) => action.type === 'publishText',
          );

          if (action) {
            options.push(action.text);
          }
        });
      }

      const optionsText = options.length
        ? optionText + options.map((option: any) => `- ${option}`).join('\n')
        : '';

      const responseMessage = `${message} + ${optionsText}`;

      return htmlToText(responseMessage);
    } catch (error) {
      console.error('Error in richToPlain: ', error);

      return response.message || '';
    }
  }

  // the replaceVars function taks in an array of variables and replaces all instances of the variable in the string with the value
  // placeholder variables in the text are denoted by the format {{variableName}}
  // for example, a request would be [{name: 'var01', value: 'Mike'}], and text would be 'Hello, my name is {{var01}}'

  replaceVars(text: string, variables: { name: string; value: string }[]) {
    variables.forEach((variable) => {
      // Avoid using the RegExp constructor with a dynamic pattern to satisfy lint/security rules.
      const placeholder = `{{${variable.name}}}`;

      text = text.split(placeholder).join(variable.value);
    });

    return text;
  }

  fixJson(string_: string) {
    try {
      return JSON.parse(string_);
    } catch {
      try {
        // Fix common JSON formatting issues
        return JSON.parse(
          // eslint-disable-next-line sonarjs/slow-regex
          string_.replace(/(['"])?([a-zA-Z\d_]+)(['"])?:/g, '"$2": '),
        );
      } catch (error_) {
        console.debug('Failed to fix and parse JSON:', error_);

        return string_;
      }
    }
  }

  tryParse = (string_: string): any => {
    try {
      return JSON.parse(string_);
    } catch (error) {
      console.debug('Failed to parse JSON:', error);

      return string_;
    }
  };

  testJSON = (a: string) => {
    try {
      return JSON.parse(a);
    } catch (error) {
      console.debug('JSON test failed:', error);

      return null;
    }
  };

  extractJson = (string_: string) => {
    if (!string_) {
      return null;
    }

    const firstOpen = string_.indexOf('{');
    const firstClose = string_.lastIndexOf('}');

    if (firstClose <= firstOpen) {
      return null;
    }

    const candidate = string_.substring(firstOpen, firstClose + 1);

    try {
      return JSON.parse(candidate);
    } catch (error) {
      console.debug('Failed to extract JSON:', error);

      return null;
    }
  };

  findJSON = (message: string): any => {
    // first, simply test to see if it is a stringified JSON
    try {
      const test = this.testJSON(message);

      if (test) {
        return test;
      }

      const jr = [message.indexOf('{') - 1, message.lastIndexOf('}') + 1];

      if (jr[0] >= 0 && jr[1] >= 0) {
        const objectTest = message.substring(jr[0], jr[1]);
        const test = this.testJSON(objectTest);

        if (test) return test;
      }

      const jr1 = [message.indexOf('{'), message.lastIndexOf('}') + 1];

      if (jr1[0] >= 0 && jr1[1] >= 0) {
        const objectTest = message.substring(jr1[0], jr1[1]);
        const test = this.testJSON(objectTest);

        if (test) return test;
      }

      const extractedJson = this.extractJson(message);

      if (extractedJson) return extractedJson;

      return null;
    } catch (error) {
      // JSON parsing failed, return null
      console.debug('Failed to parse JSON from message:', error);

      return null;
    }
  };

  hash256(string_: string) {
    return crypto.createHash('sha256').update(string_).digest('hex');
  }

  getTodayDate() {
    return new Date().toLocaleDateString();
  }

  oAuth1Header = (body: ApiKeyBasic, request: any) => {
    const oauth = new OAuth({
      consumer: {
        key: body.keyId,
        secret: body.appSecret,
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string: any, key: any) {
        return crypto
          .createHmac('sha1', key)
          .update(base_string)
          .digest('base64');
      },
    });

    const authorization = oauth.authorize(request, {
      key: body.token,
      secret: body.tokenSecret,
    });

    return oauth.toHeader(authorization);
  };

  queryToString(query: any): string {
    return Object.keys(query)
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(query, key);
        const value = descriptor?.value ?? '';

        return `${key}=${value}`;
      })
      .join('&');
  }

  async encrypt(text: string): Promise<string> {
    try {
      const encrypted = await encrypt(text);

      return encrypted;
    } catch (error) {
      console.error('Error encrypting text:', error);
      throw new Error('Encryption failed');
    }
  }

  async decrypt(encryptedText: string): Promise<any> {
    try {
      const decrypted = await decrypt(encryptedText);

      return decrypted;
    } catch (error) {
      console.error('Error decrypting text:', error);
      throw new Error('Decryption failed');
    }
  }

  ToBoolean(): (target: any, key: string) => void {
    return Transform((parameters: TransformFnParams) => {
      const { value } = parameters;

      if (typeof value === 'boolean') {
        return value;
      }

      if (value?.toString()?.toLowerCase() === 'false') {
        return false;
      }

      if (value?.toString()?.toLowerCase() === 'true') {
        return true;
      }

      return undefined;
    });
  }

  getFileExt(string_: string) {
    try {
      const extension = string_.split('.').pop();

      return extension || null;
    } catch (error) {
      // File extension extraction failed
      console.debug('Failed to extract file extension:', error);

      return null;
    }
  }

  static toCamelCase(string_: string): string {
    return string_.replace(/([-_][a-z])/gi, ($1) => {
      return $1.toUpperCase().replace('-', '').replace('_', '');
    });
  }

  static toSnakeCase(string_: string): string {
    return string_.replace(/([A-Z])/g, ($1) => {
      return `_${$1.toLowerCase()}`;
    });
  }

  static toCamelCaseObject(object: any): any {
    if (typeof object !== 'object') {
      return object;
    }

    if (Array.isArray(object)) {
      return object.map((v) => HelperService.toCamelCaseObject(v));
    }

    const newObject: any = {};

    Object.keys(object).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const value = descriptor?.value;
      const camelKey = HelperService.toCamelCase(key);

      Object.defineProperty(newObject, camelKey, {
        value: HelperService.toCamelCaseObject(value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    });

    return newObject;
  }

  static toSnakeCaseObject(object: any): any {
    if (typeof object !== 'object') {
      return object;
    }

    if (Array.isArray(object)) {
      return object.map((v) => HelperService.toSnakeCaseObject(v));
    }

    const newObject: any = {};

    Object.keys(object).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const value = descriptor?.value;
      const snakeKey = HelperService.toSnakeCase(key);

      Object.defineProperty(newObject, snakeKey, {
        value: HelperService.toSnakeCaseObject(value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    });

    return newObject;
  }

  yesNoToBoolean(value: boolean | string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === null || value === undefined) {
      return false;
    }

    const affirmativePatterns = [
      'yes',
      'true',
      '1',
      'y',
      'ok',
      'affirmative',
      'sure',
      'absolutely',
      'definitely',
      'certainly',
      'i guess',
      'i think so',
      'i suppose so',
      'i believe so',
      'i reckon',
      'i would say so',
      'i would think so',
      'i would guess so',
      'i would suppose so',
      'i would believe so',
      'i would reckon',
    ];

    const negativePatterns = [
      'no',
      'false',
      '0',
      'n',
      'nah',
      'negative',
      'nope',
      'not really',
      'not at all',
      "i don't think so",
      "i don't believe so",
      "i don't reckon",
      "i wouldn't say so",
      "i wouldn't think so",
      "i wouldn't guess so",
      "i wouldn't suppose so",
      "i wouldn't believe so",
      "i wouldn't reckon",
      'absolutely not',
      'definitely not',
      'certainly not',
      'not in a million years',
      'not even close',
      'not even remotely',
      'not even slightly',
      'not even a little bit',
      'not even a tiny bit',
      'not even a smidgen',
      'not even a fraction',
    ];

    // Normalize the input and use Sets for safe exact-match checks instead of dynamic RegExp
    const normalized = value.trim().toLowerCase();
    const affirmativeSet = new Set(affirmativePatterns);
    const negativeSet = new Set(negativePatterns);

    if (negativeSet.has(normalized)) {
      return false;
    }

    if (affirmativeSet.has(normalized)) {
      return true;
    }

    // If the value is not a clear yes or no, default to false
    return false;
  }

  transcriptToRaw(messageRecords: MessageRecord[]): string {
    let transcript = '';

    for (const record of messageRecords) {
      if (record.type === MESSAGE_TYPES.TEXT_PLAIN) {
        transcript += `${record.sentBy}:\n
        ${(record.messageData as MessageData).msg.text}\n
        ${record.time}\n\n`;
      } else {
        const data = (record.messageData as MessageDataRich).richContent
          .content;

        if (data) {
          transcript += `${record.sentBy}:\n
          ${data}\n
          ${record.time}\n\n`;
        }
      }
    }

    return transcript;
  }

  isNotNullOrUndefined(value: any): boolean {
    return value !== null && value !== undefined;
  }

  getPersonalInfoSde(sdes: SDEs) {
    const personalInfoSde = sdes?.events?.find(
      (sde) => sde.sdeType === 'PERSONAL_INFO',
    );

    if (personalInfoSde) {
      return personalInfoSde.personalInfo?.personalInfo;
    }

    return null;
  }

  getCustomerInfoSdes(sdes: SDEs) {
    const SDE = sdes?.events?.find((sde) => sde.sdeType === 'CUSTOMER_INFO');
    const customerInfoSde: CustomerInfoSde = SDE?.customerInfo;

    if (customerInfoSde?.customerInfo) {
      return {
        customerStatus: customerInfoSde.customerInfo.customerStatus,
        customerType: customerInfoSde.customerInfo.customerType,
      };
    }

    return null;
  }

  // eslint-disable-next-line sonarjs/function-return-type
  getSurveyAnswer(
    surveys: ConversationSurvey[],
    target: string,
  ): boolean | number | string | null {
    const sd = surveys?.length > 0 ? surveys[0] : null;

    if (!sd) {
      return null;
    }

    if (target === 'feedback') {
      return this.getFeedbackAnswer(sd);
    }

    if (target === 'fcr') {
      return this.getFcrAnswer(sd, target);
    }

    return this.getNumericAnswer(sd, target);
  }

  private getFeedbackAnswer(sd: ConversationSurvey): string | null {
    const targetItem = sd?.surveyData?.find(
      (item) =>
        item.questionType === 'custom' &&
        item.questionFormat === 'open' &&
        item.question?.toLowerCase().includes('feedback'),
    );

    // Only return feedback if it has actual content (not empty string)
    const answer = targetItem?.answer;

    return answer && answer.trim() !== '' ? answer : null;
  }

  private getFcrAnswer(sd: ConversationSurvey, target: string): boolean | null {
    const targetItem = sd?.surveyData?.find(
      (item) => item.questionType === target,
    );

    // Only return FCR if answer field exists and has a value
    // Note: answer might be string "true"/"false" or boolean true/false
    const answer = targetItem?.answer;

    if (answer === null || answer === undefined || answer === '') {
      return null;
    }

    return Boolean(answer);
  }

  private getNumericAnswer(
    sd: ConversationSurvey,
    target: string,
  ): number | null {
    const targetItem = sd?.surveyData?.find(
      (item) => item.questionType === target,
    );

    // Only return numeric answer if it exists and can be parsed
    // This includes "0" which is a valid CSAT/NPS score
    const answer = targetItem?.answer;

    if (answer === null || answer === undefined || answer === '') {
      return null;
    }

    const parsed = parseInt(String(answer), 10);

    // Return the parsed number only if it's valid (including 0)
    return !isNaN(parsed) ? parsed : null;
  }

  filterConversationDetails(cd: any): ConversationMetadata | null {
    if (!cd?.info) {
      return null;
    }

    const filtered: ConversationMetadata = {
      state: cd?.info?.state,
      conversationId: cd?.info?.conversationId,
      closeReason: cd?.info?.closeReason,
      closeReasonDescription: cd?.info?.closeReasonDescription,
      startTimeL: cd?.info?.startTimeL,
      endTimeL: cd?.info?.endTimeL,
      duration: cd?.info?.duration,
      latestAgentId: cd?.info?.latestAgentId,
      latestAgentNickname: cd?.info?.latestAgentNickname,
      latestAgentFullName: cd?.info?.latestAgentFullName,
      latestSkillId: cd?.info?.latestSkillId,
      latestSkillName: cd?.info?.latestSkillName,
      mcs: cd?.info?.mcs,
      status: cd?.info?.status,
      latestAgentGroupId: cd?.info?.latestAgentGroupId,
      latestAgentGroupName: cd?.info?.latestAgentGroupName,
      latestQueueState: cd?.info?.latestQueueState,
      mcsTrend: cd?.messageScores.map((ms: MessageScore) => ms.mcs),
      conversationSurveys: cd?.conversationSurveys,
      personalInfo: this.getPersonalInfoSde(cd?.sdes),
      customerInfo: this.getCustomerInfoSdes(cd?.sdes),
    };

    const csat = this.getSurveyAnswer(cd?.conversationSurveys, 'csat');

    if (csat !== null && csat !== undefined) {
      filtered.csat = csat as number;
    }

    const nps = this.getSurveyAnswer(cd?.conversationSurveys, 'nps');

    if (nps !== null && nps !== undefined) {
      filtered.nps = nps as number;
    }

    const fcr = this.getSurveyAnswer(cd?.conversationSurveys, 'fcr');

    if (fcr !== null && fcr !== undefined) {
      filtered.fcr = fcr as boolean;
    }

    const feedback = this.getSurveyAnswer(cd?.conversationSurveys, 'feedback');

    if (feedback !== null && feedback !== undefined) {
      filtered.feedback = String(feedback);
    }

    return filtered;
  }

  removeObjectProperties(object: any, properties: string[]): any {
    if (typeof object !== 'object' || object === null) {
      return object; // Return the original value if it's not an object
    }

    const newObject: any = {};

    for (const key in object) {
      if (
        Object.prototype.hasOwnProperty.call(object, key) &&
        !properties.includes(key)
      ) {
        // eslint-disable-next-line security/detect-object-injection
        newObject[key] = object[key]; // Copy properties that are not in the properties array
      }
    }

    return newObject;
  }

  /**
   * Get the time in humanised format of the last agent message sent
   * @param conversation
   * @returns the time in humanised format of the last agent message sent
   */
  getLastAgentMessageTime = (conversation: SimulationConversation) => {
    if (!conversation?.lastAgentMessageTime) {
      return null;
    }

    const lastAgentMessageTime: number = conversation.lastAgentMessageTime;

    return moment(lastAgentMessageTime).fromNow();
  };

  chunkArray<T>(array: T[], chunkSize: number): T[][] {
    if (!Array.isArray(array) || chunkSize <= 0) return [];

    const result: T[][] = [];

    for (let index = 0; index < array.length; index += chunkSize) {
      result.push(array.slice(index, index + chunkSize));
    }

    return result;
  }

  objectToString(object: Record<string, any>): string {
    if (typeof object !== 'object' || object === null) {
      return '';
    }

    return Object.entries(object)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  toBoolean(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === null || value === undefined) {
      return false;
    }

    const stringValue = String(value).toLowerCase();

    if (stringValue === 'true') {
      return true;
    }

    return stringValue === 'false' ? false : Boolean(value);
  }

  fillPrompt(
    basePrompt: string,
    variables: Record<string, any[] | boolean | number | object | string>,
  ): string {
    // Validate that all required variables are present
    for (const key of Object.keys(variables)) {
      // eslint-disable-next-line security/detect-object-injection
      if (variables[key] === undefined || variables[key] === null) {
        console.warn(`Missing or null variable: ${key}`);
      }
    }

    if (!basePrompt) {
      throw new Error(
        'Base prompt and variables are required to create a prompt.',
      );
    }

    // Safe case-insensitive replace without using the RegExp constructor
    const replaceAllCaseInsensitive = (
      input: string,
      search: string,
      replaceValue: string,
    ): string => {
      if (!search) return input;

      const lowerInput = input.toLowerCase();
      const lowerSearch = search.toLowerCase();

      let result = '';
      let startIndex = 0;
      let index = lowerInput.indexOf(lowerSearch, startIndex);

      while (index !== -1) {
        result += input.substring(startIndex, index) + replaceValue;
        startIndex = index + search.length;
        index = lowerInput.indexOf(lowerSearch, startIndex);
      }

      result += input.substring(startIndex);

      return result;
    };

    return Object.entries(variables).reduce((prompt, [key, value]) => {
      const placeholder = `{${key}}`;

      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }

      return replaceAllCaseInsensitive(prompt, placeholder, String(value));
    }, basePrompt);
  }

  createEmail(firstName: string, lastName: string) {
    // eslint-disable-next-line sonarjs/pseudo-random
    const useFullFirstName = Math.random() < 0.5;

    let b1 = '';

    if (firstName) {
      b1 = useFullFirstName
        ? firstName.toLowerCase()
        : firstName[0].toLowerCase();
    }

    // eslint-disable-next-line sonarjs/pseudo-random
    const useLastName = Math.random() < 0.5;

    let b2 = '';

    if (lastName) {
      b2 = useLastName ? lastName.toLowerCase() : lastName[0].toLowerCase();
    }

    // eslint-disable-next-line sonarjs/pseudo-random
    const b3 = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');

    const emailProviders = [
      'gmail.com',
      'yahoo.com',
      'outlook.com',
      'hotmail.com',
      'icloud.com',
      'live.com',
    ];

    const randomProvider =
      // eslint-disable-next-line sonarjs/pseudo-random
      emailProviders[Math.floor(Math.random() * emailProviders.length)];

    return `${b1}${b2}${b3}@${randomProvider}`;
  }

  allinArr1inArr2 = <T>(array1: T[], array2: T[]): boolean => {
    return array1.every((item) => array2.includes(item));
  };
}

export const helper = new HelperService();
