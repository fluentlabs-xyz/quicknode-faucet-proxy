import { NFTOwnershipValidator } from "./nft-ownership";
import { OnceOnlyValidator } from "./once-only";
import { ParaAccountValidator } from "./para-account";
import { TimeLimitValidator } from "./time-limit";

const validators = {
  "para-account": ParaAccountValidator,
  "nft-ownership": NFTOwnershipValidator,
  "once-only": OnceOnlyValidator,
  "time-limit": TimeLimitValidator,
} as const;

export {
  NFTOwnershipValidator,
  OnceOnlyValidator,
  ParaAccountValidator,
  TimeLimitValidator,
  validators,
};
