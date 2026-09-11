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

/** Map Firebase/Firestore errors to honest, user-actionable copy. */
export function describeFirebaseError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password.";
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/weak-password":
        return "Password is too weak. Use at least 8 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";
      case "auth/network-request-failed":
        return "Network error. Check your internet connection and try again.";
      case "permission-denied":
        return "You do not have permission to perform this action.";
      case "unavailable":
        return "The service is temporarily unavailable. Check your connection and try again.";
      case "failed-precondition":
        return "This action requires an internet connection.";
      default:
        break;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
