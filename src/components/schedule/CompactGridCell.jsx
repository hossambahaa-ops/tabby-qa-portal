import React, { useRef } from "react";
import CellPicker from "./CellPicker.jsx";

// Compact-grid day cell with built-in CellPicker portal.
//
// The lead's full-month compact grid (SchedulePage Calendar tab) used to
// render a plain <div> with onClick={() => setEditCell(...)} but had no
// CellPicker rendering — clicking did nothing visible. This wraps each
// cell with its own ref so the picker can anchor properly via portal.
//
// Mirrors CalendarDayCell's anchor + open/close handling but stays
// presentation-agnostic: caller passes in the visual children (plan
// badge, status text, time text) so the lead-grid styling is unchanged.
export default function CompactGridCell({
  cellKey, em, dayNum, dateIso, st,
  isEditing, canEdit, isQA, canApprove,
  pickerStage, pendingReason,
  onOpen, onClose, onSetAtt, onApproveAtt, onClearAtt,
  setPendingReason, setPickerStage,
  title, style, children,
}) {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      onClick={() => { if (canEdit) { isEditing ? onClose() : onOpen(); } }}
      title={title}
      style={{ ...style, cursor: canEdit ? "pointer" : "default" }}
    >
      {children}
      {isEditing && (
        <CellPicker
          anchorEl={ref.current}
          em={em}
          dayNum={dayNum}
          dateIso={dateIso}
          st={st}
          isQA={isQA}
          canApprove={canApprove}
          pickerStage={pickerStage}
          pendingReason={pendingReason}
          onClose={onClose}
          onSetAtt={onSetAtt}
          onApproveAtt={onApproveAtt}
          onClearAtt={onClearAtt}
          setPendingReason={setPendingReason}
          setPickerStage={setPickerStage}
        />
      )}
    </div>
  );
}
