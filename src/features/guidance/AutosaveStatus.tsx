import { useLocale } from "@/features/i18n/LocaleProvider";
import { friendlyError } from "./errors";
import type { AutosaveState } from "./useAutosave";

export function AutosaveStatus({
  state,
  error,
  retry,
}: {
  state: AutosaveState;
  error: unknown;
  retry: () => void;
}) {
  const { t } = useLocale();
  if (state === "idle") return null;
  if (state === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("save.failed")} {friendlyError(error, t)}{" "}
        <button type="button" className="btn-link" onClick={retry}>
          {t("save.retry")}
        </button>
      </p>
    );
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {state === "saving"
        ? t("save.saving")
        : state === "saved"
          ? t("save.saved")
          : t("save.unsaved")}
    </p>
  );
}
