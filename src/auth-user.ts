import { TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { flexParseJson, requestApi } from './api';
import { CookieJar } from 'tough-cookie';
import { updateCookieJar } from './requests';
import { Headers } from 'headers-polyfill';
import { TwitterApiErrorRaw, AuthenticationError, ApiError } from './errors';
import { Type, type Static } from '@sinclair/typebox';
import { Check } from '@sinclair/typebox/value';
import * as OTPAuth from 'otpauth';
import { FetchParameters } from './api-types';
import debug from 'debug';

const debugLog = debug('twitter-scraper:auth-user');

const log = (message: string): void => {
  debugLog(message);
  console.info(`[auth-user] ${message}`);
};

export interface TwitterUserAuthFlowInitRequest {
  flow_name: string;
  input_flow_data: Record<string, unknown>;
  subtask_versions: Record<string, number>;
}

export interface TwitterUserAuthFlowSubtaskRequest {
  flow_token: string;
  subtask_inputs: ({
    subtask_id: string;
  } & Record<string, unknown>)[];
}

export type TwitterUserAuthFlowRequest =
  | TwitterUserAuthFlowInitRequest
  | TwitterUserAuthFlowSubtaskRequest;

export interface TwitterUserAuthFlowResponse {
  errors?: TwitterApiErrorRaw[];
  flow_token?: string;
  status?: string;
  subtasks?: TwitterUserAuthSubtask[];
}

interface TwitterUserAuthVerifyCredentials {
  errors?: TwitterApiErrorRaw[];
}

const TwitterUserAuthSubtask = Type.Object({
  subtask_id: Type.String(),
  enter_text: Type.Optional(Type.Object({})),
});
type TwitterUserAuthSubtask = Static<typeof TwitterUserAuthSubtask>;

export type FlowTokenResultSuccess = {
  status: 'success';
  response: TwitterUserAuthFlowResponse;
};

export type FlowTokenResultError = {
  status: 'error';
  err: Error;
};

export type FlowTokenResult = FlowTokenResultSuccess | FlowTokenResultError;

export interface TwitterUserAuthCredentials {
  username: string;
  password: string;
  email?: string;
  twoFactorSecret?: string;
}

/**
 * The API interface provided to custom subtask handlers for interacting with the Twitter authentication flow.
 * This interface allows handlers to send flow requests and access the current flow token.
 *
 * The API is passed to each subtask handler and provides methods necessary for implementing
 * custom authentication subtasks. It abstracts away the low-level details of communicating
 * with Twitter's authentication API.
 *
 * @example
 * ```typescript
 * import { Scraper, FlowSubtaskHandler } from "@the-convocation/twitter-scraper";
 *
 * // A custom subtask handler that implements a hypothetical example subtask
 * const exampleHandler: FlowSubtaskHandler = async (subtaskId, response, credentials, api) => {
 *   // Process the example subtask somehow
 *   const data = await processExampleTask();
 *
 *   // Submit the processed data using the provided API
 *   return await api.sendFlowRequest({
 *     flow_token: api.getFlowToken(),
 *     subtask_inputs: [{
 *       subtask_id: subtaskId,
 *       example_data: {
 *         value: data,
 *         link: "next_link"
 *       }
 *     }]
 *   });
 * };
 *
 * const scraper = new Scraper();
 * scraper.registerAuthSubtaskHandler("ExampleSubtask", exampleHandler);
 * ```
 */
export interface FlowSubtaskHandlerApi {
  /**
   * Send a flow request to the Twitter API.
   * @param request The request object containing flow token and subtask inputs
   * @returns The result of the flow task
   */
  sendFlowRequest: (
    request: TwitterUserAuthFlowRequest,
  ) => Promise<FlowTokenResult>;
  /**
   * Gets the current flow token.
   * @returns The current flow token
   */
  getFlowToken: () => string;
}

/**
 * A handler function for processing Twitter authentication flow subtasks.
 * Library consumers can implement and register custom handlers for new or
 * existing subtask types using the Scraper.registerAuthSubtaskHandler method.
 *
 * Each subtask handler is called when its corresponding subtask ID is encountered
 * during the authentication flow. The handler receives the subtask ID, the previous
 * response data, the user's credentials, and an API interface for interacting with
 * the authentication flow.
 *
 * Handlers should process their specific subtask and return either a successful response
 * or an error. Success responses typically lead to the next subtask in the flow, while
 * errors will halt the authentication process.
 *
 * @param subtaskId - The identifier of the subtask being handled
 * @param previousResponse - The complete response from the previous authentication flow step
 * @param credentials - The user's authentication credentials including username, password, etc.
 * @param api - An interface providing methods to interact with the authentication flow
 * @returns A promise resolving to either a successful flow response or an error
 *
 * @example
 * ```typescript
 * import { Scraper, FlowSubtaskHandler } from "@the-convocation/twitter-scraper";
 *
 * // Custom handler for a hypothetical verification subtask
 * const verificationHandler: FlowSubtaskHandler = async (
 *   subtaskId,
 *   response,
 *   credentials,
 *   api
 * ) => {
 *   // Extract the verification data from the response
 *   const verificationData = response.subtasks?.[0].exampleData?.value;
 *   if (!verificationData) {
 *     return {
 *       status: 'error',
 *       err: new Error('No verification data found in response')
 *     };
 *   }
 *
 *   // Process the verification data somehow
 *   const result = await processVerification(verificationData);
 *
 *   // Submit the result using the flow API
 *   return await api.sendFlowRequest({
 *     flow_token: api.getFlowToken(),
 *     subtask_inputs: [{
 *       subtask_id: subtaskId,
 *       example_verification: {
 *         value: result,
 *         link: "next_link"
 *       }
 *     }]
 *   });
 * };
 *
 * const scraper = new Scraper();
 * scraper.registerAuthSubtaskHandler("ExampleVerificationSubtask", verificationHandler);
 *
 * // Later, when logging in...
 * await scraper.login("username", "password");
 * ```
 */
export type FlowSubtaskHandler = (
  subtaskId: string,
  previousResponse: TwitterUserAuthFlowResponse,
  credentials: TwitterUserAuthCredentials,
  api: FlowSubtaskHandlerApi,
) => Promise<FlowTokenResult>;

/**
 * A user authentication token manager.
 */
export class TwitterUserAuth extends TwitterGuestAuth {
  private readonly subtaskHandlers: Map<string, FlowSubtaskHandler> = new Map();

  constructor(bearerToken: string, options?: Partial<TwitterAuthOptions>) {
    super(bearerToken, options);
    this.initializeDefaultHandlers();
  }

  /**
   * Register a custom subtask handler or override an existing one
   * @param subtaskId The ID of the subtask to handle
   * @param handler The handler function that processes the subtask
   */
  registerSubtaskHandler(subtaskId: string, handler: FlowSubtaskHandler): void {
    this.subtaskHandlers.set(subtaskId, handler);
  }

  private initializeDefaultHandlers(): void {
    this.subtaskHandlers.set(
      'LoginJsInstrumentationSubtask',
      this.handleJsInstrumentationSubtask.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginEnterUserIdentifierSSO',
      this.handleEnterUserIdentifierSSO.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginEnterAlternateIdentifierSubtask',
      this.handleEnterAlternateIdentifierSubtask.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginEnterPassword',
      this.handleEnterPassword.bind(this),
    );
    this.subtaskHandlers.set(
      'AccountDuplicationCheck',
      this.handleAccountDuplicationCheck.bind(this),
    );
    this.subtaskHandlers.set(
      'LoginTwoFactorAuthChallenge',
      this.handleTwoFactorAuthChallenge.bind(this),
    );
    this.subtaskHandlers.set('LoginAcid', this.handleAcid.bind(this));
    this.subtaskHandlers.set(
      'LoginSuccessSubtask',
      this.handleSuccessSubtask.bind(this),
    );
  }

  async isLoggedIn(): Promise<boolean> {
    const res = await requestApi<TwitterUserAuthVerifyCredentials>(
      'https://api.x.com/1.1/account/verify_credentials.json',
      this,
    );
    if (!res.success) {
      return false;
    }

    const { value: verify } = res;
    return verify && !verify.errors?.length;
  }

  async login(
    username: string,
    password: string,
    email?: string,
    twoFactorSecret?: string,
  ): Promise<void> {
    log('Refreshing guest token before starting login flow...');
    await this.updateGuestToken();
    if (this.guestToken) {
      log(
        `Guest token refreshed (suffix: ${this.guestToken.slice(-6)}), proceeding with login flow...`,
      );
    }

    const credentials: TwitterUserAuthCredentials = {
      username,
      password,
      email,
      twoFactorSecret,
    };

    log(
      `Starting login flow for ${username} (email provided: ${
        email != null
      }, 2FA configured: ${twoFactorSecret ? 'yes' : 'no'})`,
    );

    let next: FlowTokenResult = await this.initLogin();
    log(
      `Initial login flow response received with status: ${next.status}`,
    );

    if (next.status === 'success') {
      const subtasks = next.response.subtasks?.map((task) => task.subtask_id);
      log(
        `Initial subtasks queued: ${subtasks?.length ? subtasks.join(', ') : 'none'}; flow token suffix: ${next.response.flow_token?.slice(
          -6,
        )}`,
      );
    }

    let lastSubtaskId: string | null = null;
    while (next.status === 'success' && next.response.subtasks?.length) {
      const flowToken = next.response.flow_token;
      if (flowToken == null) {
        // Should never happen
        throw new Error('flow_token not found.');
      }

      const subtaskId = next.response.subtasks[0].subtask_id;
      lastSubtaskId = subtaskId;
      const handler = this.subtaskHandlers.get(subtaskId);

      const queuedSubtasks = next.response.subtasks
        ?.map((task) => task.subtask_id)
        .join(', ');
      log(
        `Preparing to handle subtask ${subtaskId}; queued subtasks: ${queuedSubtasks}; flow token suffix: ${flowToken.slice(
          -6,
        )}`,
      );

      if (handler) {
        log(
          `Handling subtask ${subtaskId} with flow token suffix: ${flowToken.slice(
            -6,
          )}`,
        );
        next = await handler(subtaskId, next.response, credentials, {
          sendFlowRequest: this.executeFlowTask.bind(this),
          getFlowToken: () => flowToken,
        });
        log(`Subtask ${subtaskId} completed with status: ${next.status}`);
      } else {
        throw new Error(`Unknown subtask ${subtaskId}`);
      }
    }
    if (next.status === 'error') {
      log(
        `Login flow failed after subtask ${
          lastSubtaskId ?? 'initialization'
        } with error: ${next.err?.message ?? next.err}`,
      );
      throw new AuthenticationError(
        `Login flow failed after ${
          lastSubtaskId ?? 'initialization'
        }: ${next.err?.message ?? next.err}`,
      );
    }

    log(
      `Login flow completed successfully after subtask ${
        lastSubtaskId ?? 'initialization'
      }.`,
    );
  }

  async logout(): Promise<void> {
    if (!this.hasToken()) {
      return;
    }

    try {
      await requestApi<void>(
        'https://api.x.com/1.1/account/logout.json',
        this,
        'POST',
      );
    } catch (error) {
      // Ignore errors during logout but still clean up state
      console.warn('Error during logout:', error);
    } finally {
      this.deleteToken();
      this.jar = new CookieJar();
    }
  }

  async installTo(
    headers: Headers,
    url: string,
    bearerTokenOverride?: string,
  ): Promise<void> {
    await super.installTo(headers, url, bearerTokenOverride);
    headers.set('x-twitter-auth-type', 'OAuth2Session');
    headers.set('x-twitter-active-user', 'yes');
    headers.set('x-twitter-client-language', 'en');
  }

  private async initLogin(): Promise<FlowTokenResult> {
    // Reset certain session-related cookies because Twitter complains sometimes if we don't
    this.removeCookie('twitter_ads_id=');
    this.removeCookie('ads_prefs=');
    this.removeCookie('_twitter_sess=');
    this.removeCookie('zipbox_forms_auth_token=');
    this.removeCookie('lang=');
    this.removeCookie('bouncer_reset_cookie=');
    this.removeCookie('twid=');
    this.removeCookie('twitter_ads_idb=');
    this.removeCookie('email_uid=');
    this.removeCookie('external_referer=');
    this.removeCookie('ct0=');
    this.removeCookie('aa_u=');
    this.removeCookie('__cf_bm=');

    return await this.executeFlowTask({
      flow_name: 'login',
      input_flow_data: {
        flow_context: {
          debug_overrides: {},
          start_location: {
            location: 'unknown',
          },
        },
      },
      subtask_versions: {
        action_list: 2,
        alert_dialog: 1,
        app_download_cta: 1,
        check_logged_in_account: 1,
        choice_selection: 3,
        contacts_live_sync_permission_prompt: 0,
        cta: 7,
        email_verification: 2,
        end_flow: 1,
        enter_date: 1,
        enter_email: 2,
        enter_password: 5,
        enter_phone: 2,
        enter_recaptcha: 1,
        enter_text: 5,
        enter_username: 2,
        generic_urt: 3,
        in_app_notification: 1,
        interest_picker: 3,
        js_instrumentation: 1,
        menu_dialog: 1,
        notifications_permission_prompt: 2,
        open_account: 2,
        open_home_timeline: 1,
        open_link: 1,
        phone_verification: 4,
        privacy_options: 1,
        security_key: 3,
        select_avatar: 4,
        select_banner: 2,
        settings_list: 7,
        show_code: 1,
        sign_up: 2,
        sign_up_review: 4,
        tweet_selection_urt: 1,
        update_users: 1,
        upload_media: 1,
        user_recommendations_list: 4,
        user_recommendations_urt: 1,
        wait_spinner: 3,
        web_modal: 1,
      },
    });
  }

  private async handleJsInstrumentationSubtask(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await api.sendFlowRequest({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          js_instrumentation: {
            response: '{}',
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleEnterAlternateIdentifierSubtask(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: {
            text: credentials.email,
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleEnterUserIdentifierSSO(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          settings_list: {
            setting_responses: [
              {
                key: 'user_identifier',
                response_data: {
                  text_data: { result: credentials.username },
                },
              },
            ],
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleEnterPassword(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_password: {
            password: credentials.password,
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleAccountDuplicationCheck(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          check_logged_in_account: {
            link: 'AccountDuplicationCheck_false',
          },
        },
      ],
    });
  }

  private async handleTwoFactorAuthChallenge(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    if (!credentials.twoFactorSecret) {
      return {
        status: 'error',
        err: new AuthenticationError(
          'Two-factor authentication is required but no secret was provided',
        ),
      };
    }

    const totp = new OTPAuth.TOTP({ secret: credentials.twoFactorSecret });
    let error;
    for (let attempts = 1; attempts < 4; attempts += 1) {
      try {
        return await api.sendFlowRequest({
          flow_token: api.getFlowToken(),
          subtask_inputs: [
            {
              subtask_id: subtaskId,
              enter_text: {
                link: 'next_link',
                text: totp.generate(),
              },
            },
          ],
        });
      } catch (err) {
        error = err;
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      }
    }
    throw error;
  }

  private async handleAcid(
    subtaskId: string,
    _prev: TwitterUserAuthFlowResponse,
    credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return await this.executeFlowTask({
      flow_token: api.getFlowToken(),
      subtask_inputs: [
        {
          subtask_id: subtaskId,
          enter_text: {
            text: credentials.email,
            link: 'next_link',
          },
        },
      ],
    });
  }

  private async handleSuccessSubtask(
    _subtaskId: string,
    prev: TwitterUserAuthFlowResponse,
    _credentials: TwitterUserAuthCredentials,
    api: FlowSubtaskHandlerApi,
  ): Promise<FlowTokenResult> {
    return {
      status: 'success',
      response: {
        flow_token: api.getFlowToken(),
        status: 'success',
        subtasks: [],
      },
    };
  }

  private async executeFlowTask(
    data: TwitterUserAuthFlowRequest,
  ): Promise<FlowTokenResult> {
    let onboardingTaskUrl = 'https://api.x.com/1.1/onboarding/task.json';
    if ('flow_name' in data) {
      onboardingTaskUrl = `https://api.x.com/1.1/onboarding/task.json?flow_name=${data.flow_name}`;
    }

    const stageDescription = this.describeFlowStage(data);
    const sanitizedPayload = this.sanitizeFlowRequest(data);

    log(
      `Making POST request to ${onboardingTaskUrl} for ${stageDescription} with payload: ${JSON.stringify(
        sanitizedPayload,
      )}`,
    );

    const token = this.guestToken;
    if (token == null) {
      throw new AuthenticationError(
        'Authentication token is null or undefined.',
      );
    }

    const headers = new Headers({
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      origin: 'https://x.com',
      pragma: 'no-cache',
      priority: 'u=1, i',
      referer: 'https://x.com/',
      'sec-ch-ua':
        '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'x-guest-token': token,
      'x-twitter-auth-type': 'OAuth2Client',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
    });
    await this.installTo(headers, onboardingTaskUrl);

    let res: Response;
    do {
      const fetchParameters: FetchParameters = [
        onboardingTaskUrl,
        {
          credentials: 'include',
          method: 'POST',
          headers: headers,
          body: JSON.stringify(data),
        },
      ];

      try {
        res = await this.fetch(...fetchParameters);
      } catch (err) {
        if (!(err instanceof Error)) {
          throw err;
        }

        return {
          status: 'error',
          err: err,
        };
      }

      await updateCookieJar(this.jar, res.headers);

      if (res.status === 429) {
        log('Rate limit hit, waiting before retrying...');
        await this.onRateLimit({
          fetchParameters: fetchParameters,
          response: res,
        });
      }
    } while (res.status === 429);

    if (!res.ok) {
      log(
        `Flow task for ${stageDescription} failed with status ${res.status}.`,
      );
      return { status: 'error', err: await ApiError.fromResponse(res) };
    }

    const flow: TwitterUserAuthFlowResponse = await flexParseJson(res);
    const flowTokenSuffix =
      typeof flow.flow_token === 'string'
        ? flow.flow_token.slice(-6)
        : 'missing';
    const subtaskList =
      flow.subtasks?.map((task) => task.subtask_id).join(', ') ?? 'none';

    log(
      `Flow task response for ${stageDescription}: http=${res.status}, flow status=${flow.status ?? 'unknown'}, flow token suffix=${flowTokenSuffix}, subtasks=${subtaskList}.`,
    );
    if (flow?.flow_token == null) {
      return {
        status: 'error',
        err: new AuthenticationError('flow_token not found.'),
      };
    }

    if (flow.errors?.length) {
      return {
        status: 'error',
        err: new AuthenticationError(
          `Authentication error (${flow.errors[0].code}): ${flow.errors[0].message}`,
        ),
      };
    }

    if (flow.errors?.length) {
      log(
        `Authentication errors returned for ${stageDescription}: ${JSON.stringify(
          flow.errors,
        )}`,
      );
    }

    if (typeof flow.flow_token !== 'string') {
      return {
        status: 'error',
        err: new AuthenticationError('flow_token was not a string.'),
      };
    }

    const subtask = flow.subtasks?.length ? flow.subtasks[0] : undefined;
    Check(TwitterUserAuthSubtask, subtask);

    if (subtask && subtask.subtask_id === 'DenyLoginSubtask') {
      return {
        status: 'error',
        err: new AuthenticationError('Authentication error: DenyLoginSubtask'),
      };
    }

    return {
      status: 'success',
      response: flow,
    };
  }

  private describeFlowStage(data: TwitterUserAuthFlowRequest): string {
    if ('flow_name' in data) {
      return `flow initialization (${data.flow_name})`;
    }

    const subtaskIds = data.subtask_inputs
      ?.map((input) => input.subtask_id)
      .filter(Boolean);

    if (subtaskIds?.length) {
      return `subtask submission (${subtaskIds.join(', ')})`;
    }

    return 'unknown flow stage';
  }

  private sanitizeFlowRequest(data: TwitterUserAuthFlowRequest): unknown {
    const cloned = JSON.parse(JSON.stringify(data));

    if ('subtask_inputs' in cloned && Array.isArray(cloned.subtask_inputs)) {
      cloned.subtask_inputs = cloned.subtask_inputs.map((input: any) => {
        const sanitized = { ...input };

        if (sanitized.enter_password?.password != null) {
          sanitized.enter_password = {
            ...sanitized.enter_password,
            password: '[REDACTED]',
          };
        }

        if (sanitized.enter_text?.text != null) {
          sanitized.enter_text = {
            ...sanitized.enter_text,
            text: '[REDACTED]',
          };
        }

        if (sanitized.settings_list?.setting_responses) {
          sanitized.settings_list = {
            ...sanitized.settings_list,
            setting_responses: sanitized.settings_list.setting_responses.map(
              (response: any) => {
                const clonedResponse = { ...response };
                if (clonedResponse.response_data?.text_data?.result != null) {
                  clonedResponse.response_data = {
                    ...clonedResponse.response_data,
                    text_data: {
                      ...clonedResponse.response_data.text_data,
                      result: '[REDACTED]',
                    },
                  };
                }
                return clonedResponse;
              },
            ),
          };
        }

        return sanitized;
      });
    }

    return cloned;
  }
}
