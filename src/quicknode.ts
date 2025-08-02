import { DISTRIBUTOR_API_KEY, QUICKNODE_API } from "./config";

export interface QuickNodeClaimRequest {
  address: string;
  ip?: string;
  visitorId?: string;
  code?: string;
  callbackUrl?: string;
  skipDripValidation?: boolean;
}

export interface QuickNodeClaimResponse {
  transactionId?: string;
  success?: boolean;
  message?: string;
  data?: {
    amount?: number;
    amountInWei?: string;
    canClaim?: boolean;
    isTapClosed?: boolean;
  };
}

export interface QuickNodeTransactionStatus {
  txHash?: string;
  status?: "pending" | "failed" | "processed";
  amount?: number;
  blockNumber?: number;
  gasUsed?: string;
}

export interface QuickNodeCanClaimResponse {
  success: boolean;
  message?: string;
  data: {
    canClaim: boolean;
    amount: number;
    amountInWei: string;
    isTapClosed: boolean | null;
  };
}

class QuickNodeService {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    baseUrl: string = QUICKNODE_API,
    apiKey: string = DISTRIBUTOR_API_KEY
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-partner-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QuickNode API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Submit a claim to QuickNode faucet
   */
  async submitClaim(
    request: QuickNodeClaimRequest
  ): Promise<QuickNodeClaimResponse> {
    return this.makeRequest<QuickNodeClaimResponse>(
      "/partners/distributors/claim",
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Check if a user can claim from the faucet
   */
  async canClaim(
    request: Omit<QuickNodeClaimRequest, "callbackUrl">
  ): Promise<QuickNodeCanClaimResponse> {
    return this.makeRequest<QuickNodeCanClaimResponse>(
      "/partners/distributors/can-claim",
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Get transaction status by internal transaction ID
   */
  async getTransactionStatus(
    transactionId: string
  ): Promise<QuickNodeTransactionStatus> {
    return this.makeRequest<QuickNodeTransactionStatus>(
      `/partners/distributors/claim?transactionId=${encodeURIComponent(
        transactionId
      )}`
    );
  }

  /**
   * Create claim codes for distribution
   */
  async createClaimCodes(count: number): Promise<{ codes: string[] }> {
    if (count > 100) {
      throw new Error("Cannot create more than 100 codes at once");
    }

    return this.makeRequest<{ codes: string[] }>(
      "/partners/distributors/code",
      {
        method: "POST",
        body: JSON.stringify({ count }),
      }
    );
  }

  /**
   * Get all claim codes and their status
   */
  async getClaimCodes(): Promise<
    Array<{ code: string; used: boolean; usedAt?: string }>
  > {
    return this.makeRequest<
      Array<{ code: string; used: boolean; usedAt?: string }>
    >("/partners/distributors/code");
  }

  /**
   * Process a complete claim with automatic transaction status polling
   */
  async processClaimWithStatus(
    request: QuickNodeClaimRequest,
    pollIntervalMs: number = 5000,
    maxPollAttempts: number = 12 // 1 minute total
  ): Promise<{
    claimResponse: QuickNodeClaimResponse;
    transactionStatus?: QuickNodeTransactionStatus;
    finalTxHash?: string;
  }> {
    // Submit the claim
    const claimResponse = await this.submitClaim(request);

    if (!claimResponse.transactionId) {
      return { claimResponse };
    }

    // Poll for transaction status
    let attempts = 0;
    let transactionStatus: QuickNodeTransactionStatus | undefined;

    while (attempts < maxPollAttempts) {
      try {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        transactionStatus = await this.getTransactionStatus(
          claimResponse.transactionId
        );

        if (
          transactionStatus.status === "processed" ||
          transactionStatus.status === "failed"
        ) {
          break;
        }
      } catch (error) {
        console.warn(
          `Failed to poll transaction status (attempt ${attempts + 1}):`,
          error
        );
      }

      attempts++;
    }

    return {
      claimResponse,
      transactionStatus,
      finalTxHash: transactionStatus?.txHash,
    };
  }
}

// Export singleton instance
export const quickNodeService = new QuickNodeService();

// Export class for testing or custom instances
export { QuickNodeService };
