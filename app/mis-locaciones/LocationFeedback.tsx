import {
  getLocationErrorMessage,
  getLocationSuccessMessage,
} from "@/lib/locations/form";

export default function LocationFeedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  const errorMessage = getLocationErrorMessage(error);
  const successMessage = getLocationSuccessMessage(success);

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="mt-8 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm leading-6 text-red-200"
      >
        {errorMessage}
      </div>
    );
  }

  if (successMessage) {
    return (
      <div
        role="status"
        className="mt-8 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-200"
      >
        {successMessage}
      </div>
    );
  }

  return null;
}
