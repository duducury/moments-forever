export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
  readonly active: boolean;
}

export interface UserLicense {
  readonly id: string;
  readonly planId: string;
  readonly planName: string;
  readonly maxNfcTags: number;
  readonly maxPhotosPerTrip: number;
}
