import { SignupProduct } from "@kleros/kleros-app";

/**
 * Picks the confirmation email template Atlas sends on add/update email; the email itself is
 * shared by every product. CourtV2 until Atlas offers a neutral Kleros product.
 */
export const SIGNUP_PRODUCT = SignupProduct.CourtV2;
