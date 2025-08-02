import { config } from "../config";

export interface QuickNodeClaimRequest {
  address: string;
  ip?: string;
  visitorId?: string;
  skipDripValidation?: boolean;
}

export interface QuickNodeClaimResponse {
  transactionId?: string;
  success?: boolean;
  message?: string;
  data?: {
    amount?: number;
  };
}

class QuickNodeService {
  private baseUrl = config.quicknodeApi;
  private apiKey = config.distributorApiKey;

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-partner-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Handle known business errors
      if (response.status === 400) {
        try {
          const errorData = JSON.parse(errorText);

          // Tap is not open
          if (errorData.data?.isTapClosed === true) {
            return {
              success: false,
              message: "Faucet temporarily unavailable: daily limit reached",
              data: errorData.data,
            } as T;
          }

          // Generic claim validation error
          if (errorText.includes("Claim is not valid")) {
            return {
              success: false,
              message: errorData.message || "Claim is not valid",
            } as T;
          }
        } catch (e) {
          // Continue with generic error if parsing fails
        }
      }

      throw new Error(`QuickNode API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async submitClaim(
    request: QuickNodeClaimRequest
  ): Promise<QuickNodeClaimResponse> {
    console.log("Submitting claim to QuickNode:", JSON.stringify(request));

    // Add skipDripValidation for testing
    // WARNING: Remove this in production or make it configurable!
    const claimRequest = {
      ...request,
      // skipDripValidation: true,
    };

    return this.makeRequest<QuickNodeClaimResponse>(
      "/partners/distributors/claim",
      {
        method: "POST",
        body: JSON.stringify(claimRequest),
      }
    );
  }
}

export const quickNodeService = new QuickNodeService();
