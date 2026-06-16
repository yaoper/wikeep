import { BackIcon, MoreIcon, RefreshIcon } from "./icons";
import { SearchBox } from "./SearchBox";
import type { SidePanelView } from "../sidepanel/viewTypes";

interface PanelToolbarProps {
  view: SidePanelView;
  showBack: boolean;
  toolbarTitle: string;
  keyword: string;
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onKeywordChange: (value: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  onToggleMenu: () => void;
  onSelectView: (view: SidePanelView) => void;
}

export function PanelToolbar({
  view,
  showBack,
  toolbarTitle,
  keyword,
  menuOpen,
  menuRef,
  onKeywordChange,
  onBack,
  onRefresh,
  onToggleMenu,
  onSelectView,
}: PanelToolbarProps) {
  return (
    <div
      className={
        showBack ? "panel__toolbar panel__toolbar--settings" : "panel__toolbar"
      }
    >
      {showBack ? (
        <>
          <button className="back-btn" onClick={onBack}>
            <BackIcon />
            <span>Back</span>
          </button>
          <div className="panel__toolbar-title">{toolbarTitle}</div>
        </>
      ) : (
        <>
          <SearchBox
            value={keyword}
            onChange={onKeywordChange}
            placeholder="Search by repo name or conversation"
          />
          <button
            type="button"
            className="btn-icon"
            title="Refresh"
            onClick={onRefresh}
          >
            <RefreshIcon />
          </button>
          <div className="dropdown" ref={menuRef}>
            <button
              type="button"
              className="btn-icon"
              title="More"
              onClick={onToggleMenu}
            >
              <MoreIcon />
            </button>
            {menuOpen ? (
              <div className="dropdown__menu">
                <button
                  type="button"
                  className="dropdown__item"
                  onClick={() => onSelectView("settings")}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className="dropdown__item"
                  onClick={() => onSelectView("backup")}
                >
                  Backup & Restore
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
