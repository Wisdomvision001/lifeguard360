import { Timestamp } from "firebase/firestore";

/**
 * Shared Firestore helpers: consistent error surfacing and timestamp mapping.
 * Domain types use ISO strings; Firestore stores server timestamps.
 */

export function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return "";
}

/**
 * Map Firebase Auth / Firestore / Storage errors to honest, user-actionable
 * copy. Every branch names the action that failed and a concrete recovery
 * path — never a fabricated success, never a swallowed error.
 */
export function describeFirebaseError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    switch (code) {
      // ---- authentication (email/password + Google) ----
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password.";
      case "auth/email-already-in-use":
        return "An account with this email already exists. Sign in instead, or use Google sign-in for this address.";
      case "auth/weak-password":
        return "Password is too weak. Use at least 8 characters.";
      case "auth/invalid-email":
        return "That email address is not valid. Check it and try again.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";
      case "auth/network-request-failed":
        return "Network error. Check your internet connection and try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Contact the project administrator.";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in popup. Allow popups for this site, then try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Google sign-in was cancelled.";
      case "auth/account-exists-with-different-credential":
        return "An account with this email already exists with a password. Enter your password to link Google sign-in.";
      case "auth/operation-not-allowed":
        return "This sign-in method is not enabled in the Firebase project yet. Enable it in Firebase Console → Authentication → Sign-in method.";
      case "auth/unauthorized-domain":
        return "This domain is not authorized for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.";
      case "auth/invalid-action-code":
      case "auth/expired-action-code":
        return "This link is invalid or has expired. Request a new one.";
      case "auth/requires-recent-login":
        return "For security, sign in again before repeating this action.";
      case "auth/missing-email":
        return "Enter your email address to continue.";

      // ---- Firestore ----
      case "permission-denied":
        return "You do not have permission to perform this action. Sign in with an account that has access, or ask the project administrator to grant your account access.";
      case "unauthenticated":
        return "You need to be signed in to do that. Sign in and try again.";
      case "unavailable":
        return "The service is temporarily unavailable. Check your connection and try again.";
      case "failed-precondition":
        return "This action requires an internet connection.";
      case "not-found":
        return "That document no longer exists. Refresh the page and try again.";

      // ---- Firebase Storage ----
      case "storage/unauthorized":
        return "Firebase Storage denied this request. Either Storage is not set up for this project yet (it requires the pay-as-you-go Blaze plan) or your account is not authorized. Finish Storage setup in the Firebase console, sign in with an admin account, then retry.";
      case "storage/bucket-not-found":
        return "The Firebase Storage bucket does not exist for this project yet. Finish Storage setup in the Firebase console, then retry.";
      case "storage/unknown":
        return "Firebase Storage could not complete the request. If Storage was just set up, wait a minute and retry.";
      case "storage/retry-limit-exceeded":
        return "Firebase Storage is unreachable right now. Check your connection and try again.";
      case "storage/canceled":
        return "The Storage operation was cancelled. Try again.";
      case "storage/quota-exceeded":
        return "Firebase Storage quota exceeded. Ask the project owner to review usage in the Firebase console.";
      case "storage/invalid-format":
        return "That file is not a supported image. Choose a PNG, JPEG, WebP or GIF.";
      case "storage/invalid-checksum":
        return "The upload was corrupted in transit. Try the file again.";
      default:
        break;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
