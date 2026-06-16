import type { ActiveTabContext } from "../../shared/types";
import {
  getStatusActionLabel,
  getStatusSubtitle,
  getStatusTitle,
  getStatusTone,
} from "./status";
import { statusToneClass } from "./statusClass";

export function getStatusViewModel(
  context: ActiveTabContext | null,
  loading: boolean,
) {
  const tone = getStatusTone(context);

  return {
    tone,
    rootClassName: statusToneClass(tone, "status-bar"),
    dotClassName: statusToneClass(tone, "status-bar__dot"),
    titleClassName: statusToneClass(tone, "status-bar__title"),
    title: loading ? "Reading current page status" : getStatusTitle(context),
    subtitle: loading ? "Please wait…" : getStatusSubtitle(context),
    actionLabel: getStatusActionLabel(context),
    showFullWikiAction: context?.routeKind === "wiki",
  };
}
