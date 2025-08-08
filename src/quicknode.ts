import { logger, logError } from "./logger";
import type { DistributorRules, DripInterval } from "./types";

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

export interface QuickNodeRuleResponse {
  key: string;
  value: string | number;
  uuid: string;
}

/**
 * QuickNode API Service
 * KISS: Simple and direct API calls
 */
class QuickNodeService {
  private readonly baseUrl: string;
  private readonly partnerApiKey: string;

  constructor() {
    this.baseUrl = Bun.env.FAUCET_API_URL || "https://api.faucet.quicknode.com";
    this.partnerApiKey = Bun.env.PARTNER_API_KEY!;

    if (!this.partnerApiKey) {
      throw new Error("PARTNER_API_KEY is required");
    }
  }

  /**
   * Submit claim to QuickNode
   */
  async submitClaim(
    distributorApiKey: string,
    request: QuickNodeClaimRequest
  ): Promise<QuickNodeClaimResponse> {
    logger.info("Submitting claim to QuickNode", {
      component: "quicknode",
      address: request.address,
      visitorId: request.visitorId,
    });

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

      // Handle errors
      if (!response.ok) {
        return this.handleClaimError(response.status, responseText);
      }

      const data = JSON.parse(responseText);

      logger.info("Claim submitted successfully", {
        component: "quicknode",
        transactionId: data.transactionId,
      });

      return {
        transactionId: data.transactionId,
        success: true,
        message: "Claim processed successfully",
      };
    } catch (error) {
      logError("QuickNode claim submission failed", error, "quicknode");
      throw error;
    }
  }

  /**
   * Get distributor rules from QuickNode
   */
  async getDistributorRules(distributorId: string): Promise<DistributorRules> {
    logger.info("Fetching distributor rules", {
      component: "quicknode",
      distributorId,
    });

    try {
      const response = await fetch(
        `${this.baseUrl}/partners/distributors/${distributorId}/rules`,
        {
          headers: {
            "x-partner-api-key": this.partnerApiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch rules: ${response.status}`);
      }

      const data = (await response.json()) as {
        rules: QuickNodeRuleResponse[];
      };

      // Convert to simple object with proper type handling
      const rules: DistributorRules = {};

      for (const rule of data.rules) {
        switch (rule.key) {
          case "DEFAULT_DRIP_AMOUNT":
            rules.DEFAULT_DRIP_AMOUNT = rule.value as number;
            break;
          case "DRIP_PER_INTERVAL":
            rules.DRIP_PER_INTERVAL = rule.value as number;
            break;
          case "DRIP_INTERVAL":
            rules.DRIP_INTERVAL = rule.value as DripInterval;
            break;
          // Ignore unknown rules
        }
      }

      logger.info("Distributor rules fetched", {
        component: "quicknode",
        distributorId,
        rules,
      });

      return rules;
    } catch (error) {
      logError("Failed to fetch distributor rules", error, "quicknode", {
        distributorId,
      });
      throw error;
    }
  }

  /**
   * Update distributor rules
   * Creates or updates rules - QuickNode handles deduplication
   */
  async updateDistributorRules(
    distributorId: string,
    rules: DistributorRules
  ): Promise<void> {
    logger.info("Updating distributor rules", {
      component: "quicknode",
      distributorId,
      rules,
    });

    try {
      // QuickNode API creates or updates based on key
      for (const [key, value] of Object.entries(rules)) {
        if (value === undefined) continue;

        const response = await fetch(
          `${this.baseUrl}/partners/distributors/${distributorId}/rules`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-partner-api-key": this.partnerApiKey,
            },
            body: JSON.stringify({ key, value }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to update rule ${key}: ${response.status}`);
        }

        logger.info("Rule updated", {
          component: "quicknode",
          distributorId,
          rule: key,
          value,
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      logError("Failed to update distributor rules", error, "quicknode", {
        distributorId,
        rules,
      });
      throw error;
    }
  }

  /**
   * Handle claim errors
   */
  private handleClaimError(
    status: number,
    responseText: string
  ): QuickNodeClaimResponse {
    try {
      const errorData = JSON.parse(responseText);

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
    } catch {
      // Can't parse error
      return {
        success: false,
        message: `QuickNode API error (${status})`,
      };
    }
  }
}

// Singleton instance
export const quickNodeService = new QuickNodeService();
