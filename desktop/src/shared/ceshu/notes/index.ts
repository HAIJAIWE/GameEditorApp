/**
 * shared/ceshu/notes 能力入口。
 *
 * 外部一律从这里 import（`.../notes`），不要再深插目录内文件。
 */

export { CESHU_STATUS_LABELS, DUPLICATE_NAME_SUFFIX, RECENT_LIMIT, UNCATEGORIZED_TYPE, UNNAMED_CESHU, UPDATED_DISPLAY_MAX, buildCeshuCard, buildCeshuCards, buildDuplicateName, ceshuCardTitle, ceshuProgressPercent, ceshuStatusLabel, ceshuTypeLabel, ceshuUpdatedDisplay, ceshuVersionBadge, filterCeshuCards, filterPendingCards, pickRecentCeshu } from './ceshuHome'
export type { CeshuCardView } from './ceshuHome'
export { checkLedger, checkPrototypeAcceptanceResults, checkTestCaseList, normalizeAcceptanceResult } from './ceshuEvidence'
export type { AcceptanceResultStatus } from './ceshuEvidence'
export { DEFAULT_NOTE_AUTHOR, countNotesByChapter, createNote, createNoteId, deleteNoteIn, filterNotes, notePreview, parseNotesFile, serializeNotesFile, sortNotes, updateNoteIn } from './ceshuNotes'
export type { CeshuNote, CeshuNotesFile } from './ceshuNotes'
