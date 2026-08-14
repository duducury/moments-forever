export type MemoryVisibility = "private" | "public";

export interface MemorySummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly visibility: MemoryVisibility;
}

export interface HealthResponse {
  readonly status: "ok";
  readonly service: "moments-forever-api";
}

export type PhotoDateSource =
  | "exif"
  | "file-last-modified"
  | "unknown";

export interface PhotoGps {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PhotoDimensions {
  readonly width: number;
  readonly height: number;
  readonly orientation: number | null;
}

export interface PhotoExifSummary {
  readonly availableFields: readonly string[];
  readonly cameraMake: string | null;
  readonly cameraModel: string | null;
  readonly orientation: number | null;
}

export interface LocalPhotoMetadata {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number | null;
  readonly date: string | null;
  readonly dateSource: PhotoDateSource;
  readonly gps: PhotoGps | null;
  readonly dimensions: PhotoDimensions | null;
  readonly exif: PhotoExifSummary;
  readonly fingerprint: string;
  readonly duplicateOf: string | null;
  readonly warnings: readonly string[];
  readonly analysisMs: number;
}

export type PhotoGroupKind =
  | "location-temporal"
  | "location"
  | "date"
  | "manual"
  | "unknown";

export interface PhotoImportGroup {
  readonly id: string;
  readonly kind: PhotoGroupKind;
  readonly label: string;
  readonly photoIds: readonly string[];
  readonly roundedGps: PhotoGps | null;
  readonly date: string | null;
}

export interface PhotoGroupingConfig {
  readonly locationRadiusKm: number;
  readonly temporalWindowMs: number;
  readonly showRoundedCoordinates: boolean;
  readonly coordinateDecimals: number;
}

export interface PhotoImportDiagnostics {
  readonly total: number;
  readonly withGps: number;
  readonly withoutGps: number;
  readonly withDate: number;
  readonly withoutDate: number;
  readonly totalOriginalBytes: number;
  readonly totalAnalysisMs: number;
  readonly averageAnalysisMs: number;
  readonly groups: number;
  readonly selected: number;
  readonly duplicates: number;
  readonly jsHeapBytes: number | null;
}

export interface PhotoSelectionState {
  readonly selectedIds: readonly string[];
}

export interface PhotoReadySummary {
  readonly selectedCount: number;
  readonly selectedGroupCount: number;
  readonly selectedOriginalBytes: number;
}

export interface PhotoWorkerAnalyzeRequest<FileDescriptor> {
  readonly type: "analyze";
  readonly files: readonly FileDescriptor[];
  readonly chunkSize: number;
}

export interface PhotoWorkerCancelRequest {
  readonly type: "cancel";
}

export type PhotoWorkerRequest<FileDescriptor> =
  | PhotoWorkerAnalyzeRequest<FileDescriptor>
  | PhotoWorkerCancelRequest;

export interface PhotoWorkerItemResult<Thumbnail> {
  readonly type: "item";
  readonly metadata: LocalPhotoMetadata;
  readonly thumbnail: Thumbnail | null;
  /** MVP display derivative (~2048 JPEG). Absent on older workers. */
  readonly preview?: Thumbnail | null;
}

export interface PhotoWorkerProgress {
  readonly type: "progress";
  readonly completed: number;
  readonly total: number;
}

export interface PhotoWorkerItemError {
  readonly type: "error";
  readonly id: string;
  readonly message: string;
}

export interface PhotoWorkerComplete {
  readonly type: "complete";
  readonly cancelled: boolean;
}

export type PhotoWorkerResult<Thumbnail> =
  | PhotoWorkerItemResult<Thumbnail>
  | PhotoWorkerProgress
  | PhotoWorkerItemError
  | PhotoWorkerComplete;

/** Persistence enums — docs/database.md Stage 1 */
export type ExperienceStatus =
  | "draft"
  | "processing"
  | "published"
  | "archived";

export type ExperienceVisibility = "private" | "public";

export type LocationSource = "gps" | "manual";

export type DbPhotoDateSource =
  | "exif_original"
  | "exif_created"
  | "absent";

/**
 * Date sources accepted by the import→DB mapper.
 * Includes local import labels plus explicit EXIF field origins.
 */
export type ImportDateSource =
  | PhotoDateSource
  | "exif_original"
  | "exif_created";

export interface ExperienceDraft {
  readonly id: string;
  readonly ownerId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly primaryCity: string | null;
  readonly primaryCountry: string | null;
  readonly coverPhotoId: string | null;
  readonly status: "draft";
  readonly visibility: "private";
}

export interface PlaceDraft {
  readonly id: string;
  readonly experienceId: string;
  readonly name: string;
  readonly exactLatitude: number | null;
  readonly exactLongitude: number | null;
  readonly locationSource: LocationSource | null;
  readonly confirmedByUser: boolean;
}

export interface MomentDraft {
  readonly id: string;
  readonly experienceId: string;
  readonly placeId: string | null;
  readonly title: string | null;
  readonly position: number;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly confirmedByUser: boolean;
}

export interface PhotoDraft {
  readonly id: string;
  readonly experienceId: string;
  readonly momentId: string;
  readonly positionInMoment: number;
  readonly capturedAt: string | null;
  readonly dateSource: DbPhotoDateSource;
  readonly exactLatitude: number | null;
  readonly exactLongitude: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly format: string | null;
}

export interface ExperienceImportDraft {
  readonly experience: ExperienceDraft;
  readonly places: readonly PlaceDraft[];
  readonly moments: readonly MomentDraft[];
  readonly photos: readonly PhotoDraft[];
}

/** How to fold GPS groups into albums during import / add-photos. */
export type ImportOrganizationMode = "separate" | "single" | "nested";

export interface ImportOrganizationChild {
  readonly groupId: string;
  readonly name: string;
  readonly photoIds: readonly string[];
}

/**
 * Client → server plan for post-create album shaping.
 * Does not alter photo GPS; only album hierarchy / assignment.
 */
export interface ImportOrganizationPlan {
  readonly mode: ImportOrganizationMode;
  readonly rootName: string;
  readonly children: readonly ImportOrganizationChild[];
}

export interface BuildExperienceDraftFromImportInput {
  readonly ownerId: string;
  readonly title: string;
  readonly slug: string;
  readonly photos: readonly LocalPhotoMetadata[];
  readonly groups: readonly PhotoImportGroup[];
  readonly selectedIds: readonly string[];
  readonly experienceId?: string;
  readonly description?: string | null;
}

export interface CreateExperienceFromImportResult {
  readonly id: string;
  readonly slug: string;
}
