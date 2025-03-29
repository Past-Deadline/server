export interface ScheduleRequirementsDTO {
  time_frame: {
    start: string;
    end: string;
  };
  orbit: 'LEO' | 'MEO' | 'GEO';
  point_of_interest?: {
    latitude: number;
    longitude: number;
  };
}
