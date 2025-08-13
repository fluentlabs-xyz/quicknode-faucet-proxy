import { log } from "./logger";

export interface QuickNodeClaimRequest {
  address: string;
  ip?: string;
  visitorId?: string;
}

export interface QuickNodeClaimResponse {
  transactionId?: string;
  success: boolean;
  message?: string;
}

/**
 * QuickNode API Service
 * KISS: Simple and direct API calls
 */
class QuickNodeService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = Bun.env.FAUCET_API_URL || "https://api.faucet.quicknode.com";
  }

  /**
   * Submit claim to QuickNode
   */
  async submitClaim(
    distributorApiKey: string,
    request: QuickNodeClaimRequest,
    requestId?: string
  ): Promise<QuickNodeClaimResponse> {
    if (requestId) {
      log.info("Submitting claim", "quicknode", requestId, {
        address: request.address,
        visitorId: request.visitorId,
        ip: request.ip,
      });
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/partners/distributors/claim`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-partner-api-key": distributorApiKey,
          },
          body: JSON.stringify(request),
        }
      );

      const responseText = await response.text();

      // Handle errors with requestId for tracing
      if (!response.ok) {
        return this.handleClaimError(response.status, responseText, requestId);
      }

      const data = JSON.parse(responseText);

      if (requestId) {
        log.info("Claim submitted successfully", "quicknode", requestId, {
          txId: data.transactionId,
          address: request.address,
        });
      }

      return {
        transactionId: data.transactionId,
        success: true,
        message: "Claim processed successfully",
      };
    } catch (error) {
      log.error("Claim submission failed", "quicknode", error, requestId, {
        address: request.address,
        distributorApiKey: distributorApiKey.substring(0, 8) + "...", // Log partial key for debugging
      });
      throw error;
    }
  }

  /**
   * Handle claim errors with proper logging
   */
  private handleClaimError(
    status: number,
    responseText: string,
    requestId?: string
  ): QuickNodeClaimResponse {
    try {
      const errorData = JSON.parse(responseText);

      // Log the actual error from QuickNode
      log.error("QuickNode claim rejected", "quicknode", null, requestId, {
        status,
        errorData,
        isTapClosed: errorData.data?.isTapClosed,
        message: errorData.message,
      });

      // Daily limit reached
      if (errorData.data?.isTapClosed === true) {
        return {
          success: false,
          message: "Faucet temporarily unavailable: daily limit reached",
        };
      }

      // Return actual error message from API
      return {
        success: false,
        message: errorData.message || `QuickNode API error (${status})`,
      };
    } catch (parseError) {
      // Log parsing error
      log.error(
        "Failed to parse QuickNode error response",
        "quicknode",
        parseError,
        requestId,
        {
          status,
          responseText: responseText.substring(0, 500), // Limit log size
        }
      );

      return {
        success: false,
        message: `QuickNode API error (${status})`,
      };
    }
  }
}

// Singleton instance
export const quickNodeService = new QuickNodeService();
