/**
 * Housekeeping-report formats. Add a new PMS by appending one entry:
 * official column titles in `headers`, and the exact status text that report prints in `statuses`.
 * Header and status keys are lowercase with spaces and punctuation removed.
 */

export type ReportPmsId =
  | "SKYTOUCH"
  | "CHOICE_ADVANTAGE"
  | "SYNXIS"
  | "AUTOCLERK"
  | "VISUAL_MATRIX"
  | "STAY_PMS";

export type ReportColumnField =
  | "roomNumber"
  | "roomType"
  | "floor"
  | "status"
  | "guestStatus"
  | "service"
  | "housekeeperName"
  | "guestName"
  | "notes"
  | "arrivalDate"
  | "departureDate";

type StayCode =
  | "VACANT"
  | "OCCUPIED"
  | "DEPARTING"
  | "STAYOVER"
  | "ARRIVING"
  | "CHECKED_OUT"
  | "MAINTENANCE";

type HkCode =
  | "VACANT_DIRTY"
  | "VACANT_CLEAN"
  | "INSPECTED"
  | "OUT_OF_ORDER"
  | "OUT_OF_INVENTORY"
  | "MAINTENANCE";

type StatusMeaning = { hk?: HkCode; guest?: StayCode };

export type ReportPmsProfile = {
  id: ReportPmsId;
  label: string;
  columns: string[];
  optionalColumns: string[];
  statusValues: string[];
  guestValues: string[];
  sample: string;
  headers: Record<string, ReportColumnField>;
  statuses: Record<string, StatusMeaning>;
};

export function normalizeReportKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function hk(code: HkCode, guest?: StayCode): StatusMeaning {
  return guest ? { hk: code, guest } : { hk: code };
}

function stay(code: StayCode): StatusMeaning {
  return { guest: code };
}

const BLOCKED = {
  outoforder: hk("OUT_OF_ORDER", "MAINTENANCE"),
  ooo: hk("OUT_OF_ORDER", "MAINTENANCE"),
  outofservice: hk("OUT_OF_ORDER", "MAINTENANCE"),
  oos: hk("OUT_OF_ORDER", "MAINTENANCE"),
  outofinventory: hk("OUT_OF_INVENTORY", "MAINTENANCE"),
  ooi: hk("OUT_OF_INVENTORY", "MAINTENANCE"),
} satisfies Record<string, StatusMeaning>;

const STAY_WORDS = {
  vacant: stay("VACANT"),
  occupied: stay("OCCUPIED"),
  stayover: stay("STAYOVER"),
  stayovers: stay("STAYOVER"),
  stay: stay("STAYOVER"),
  arrivals: stay("ARRIVING"),
  dueout: stay("DEPARTING"),
  departing: stay("DEPARTING"),
  departure: stay("DEPARTING"),
  checkout: stay("DEPARTING"),
  co: stay("DEPARTING"),
  checkedout: stay("CHECKED_OUT"),
  departed: stay("CHECKED_OUT"),
  arrival: stay("ARRIVING"),
  arriving: stay("ARRIVING"),
  duein: stay("ARRIVING"),
} satisfies Record<string, StatusMeaning>;

const STAY_COLUMNS = {
  checkin: "arrivalDate",
  checkindate: "arrivalDate",
  arrival: "arrivalDate",
  arrivaldate: "arrivalDate",
  checkout: "departureDate",
  checkoutdate: "departureDate",
  departure: "departureDate",
  departuredate: "departureDate",
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",
  remarks: "notes",
  remark: "notes",
  specialrequests: "notes",
  specialrequest: "notes",
  requests: "notes",
  oooooinotes: "notes",
  roomnotes: "notes",
  updatenotes: "notes",
} as const satisfies Record<string, ReportColumnField>;

const COMBINED = {
  vacantdirty: hk("VACANT_DIRTY", "VACANT"),
  vd: hk("VACANT_DIRTY", "VACANT"),
  vacantclean: hk("VACANT_CLEAN", "VACANT"),
  vc: hk("VACANT_CLEAN", "VACANT"),
  occupieddirty: hk("VACANT_DIRTY", "OCCUPIED"),
  od: hk("VACANT_DIRTY", "OCCUPIED"),
  occupiedclean: hk("VACANT_CLEAN", "OCCUPIED"),
  oc: hk("VACANT_CLEAN", "OCCUPIED"),
} satisfies Record<string, StatusMeaning>;

export const REPORT_PMS_LIST: ReportPmsProfile[] = [
  {
    id: "SKYTOUCH",
    label: "SkyTouch",
    columns: ["Room", "Room Type", "Housekeeping Status", "Occupancy Status", "Guest Status"],
    optionalColumns: ["Housekeeper", "Check-In", "Check-Out", "Notes"],
    statusValues: ["Dirty", "Ready"],
    guestValues: ["Occupied", "Vacant", "Stayover", "Departing", "Checked Out"],
    sample: [
      "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Housekeeper,Check-In,Check-Out",
      "114,QQSTD,Dirty,Occupied,Occupied,Falsey,2026-10-08,2026-10-10",
      "120,QQSTD,Dirty,Occupied,Stayover,,2026-10-06,2026-10-09",
      "115,KNWP,Ready,Vacant,Checked Out,Falsey,,",
      "310,DLSU,Dirty,Vacant,Vacant,Daniel,,",
    ].join("\n"),
    headers: {
      room: "roomNumber",
      roomnumber: "roomNumber",
      roomno: "roomNumber",
      roomtype: "roomType",
      type: "roomType",
      housekeepingstatus: "status",
      status: "status",
      condition: "status",
      roomcondition: "status",
      occupancystatus: "guestStatus",
      occupancy: "guestStatus",
      servicetype: "service",
      service: "service",
      gueststatus: "service",
      guestname: "guestName",
      guest: "guestName",
      housekeeper: "housekeeperName",
      attendant: "housekeeperName",
      floor: "floor",
      ...STAY_COLUMNS,
    },
    statuses: {
      dirty: hk("VACANT_DIRTY"),
      clean: hk("VACANT_CLEAN"),
      ready: hk("VACANT_CLEAN"),
      d: hk("VACANT_DIRTY"),
      c: hk("VACANT_CLEAN"),
      ...COMBINED,
      ...BLOCKED,
      ...STAY_WORDS,
    },
  },
  {
    id: "CHOICE_ADVANTAGE",
    label: "Choice Advantage",
    columns: ["Room", "Room Type", "Housekeeping Status", "Occupancy Status", "Guest Status"],
    optionalColumns: ["Housekeeper", "Check-In", "Check-Out", "Notes"],
    statusValues: ["Dirty", "Ready"],
    guestValues: ["Occupied", "Vacant", "Stayover", "Departing", "Checked Out"],
    sample: [
      "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Housekeeper,Check-In,Check-Out",
      "114,QQSTD,Dirty,Occupied,Occupied,Falsey,2026-10-08,2026-10-10",
      "120,QQSTD,Dirty,Occupied,Stayover,,2026-10-06,2026-10-09",
      "115,KNWP,Ready,Vacant,Checked Out,Falsey,,",
      "310,DLSU,Dirty,Vacant,Vacant,Daniel,,",
    ].join("\n"),
    headers: {
      room: "roomNumber",
      roomnumber: "roomNumber",
      roomno: "roomNumber",
      roomnum: "roomNumber",
      type: "roomType",
      roomtype: "roomType",
      status: "status",
      roomstatus: "status",
      hkstatus: "status",
      housekeepingstatus: "status",
      occupancy: "guestStatus",
      occupancystatus: "guestStatus",
      fostatus: "guestStatus",
      frontofficestatus: "guestStatus",
      gueststatus: "service",
      guestname: "guestName",
      guest: "guestName",
      name: "guestName",
      housekeeper: "housekeeperName",
      housekeepername: "housekeeperName",
      floor: "floor",
      ...STAY_COLUMNS,
    },
    statuses: {
      dirty: hk("VACANT_DIRTY"),
      clean: hk("VACANT_CLEAN"),
      ready: hk("VACANT_CLEAN"),
      ...COMBINED,
      ...BLOCKED,
      ...STAY_WORDS,
    },
  },
  {
    id: "SYNXIS",
    label: "Synxis",
    columns: ["Room", "Room Type", "Housekeeping Status", "Occupancy Status", "Guest Status"],
    optionalColumns: ["Check-In", "Check-Out", "Notes"],
    statusValues: ["Dirty", "Clean"],
    guestValues: ["Occupied", "Vacant", "Stay Overs", "Checked Out", "Arrivals"],
    sample: [
      "Room,Room Type,Housekeeping Status,Occupancy Status,Guest Status,Check-In,Check-Out,Notes",
      "101,RM2,Dirty,Occupied,Stay Overs,2026-10-04,2026-10-09,",
      "111,SU2,Clean,Vacant,Checked Out,2026-10-07,2026-10-08,",
      "214,AC1,Clean,Vacant,Arrivals,2026-10-08,2026-10-11,",
      "204,RM3,Clean,Vacant,,,,",
    ].join("\n"),
    headers: {
      room: "roomNumber",
      roomnumber: "roomNumber",
      roomno: "roomNumber",
      roomnum: "roomNumber",
      roomtype: "roomType",
      type: "roomType",
      housekeepingstatus: "status",
      hkstatus: "status",
      hskstatus: "status",
      roomstatus: "status",
      status: "status",
      frontofficestatus: "guestStatus",
      fostatus: "guestStatus",
      occupancystatus: "guestStatus",
      occupancy: "guestStatus",
      reservationstatus: "guestStatus",
      gueststatus: "service",
      guestname: "guestName",
      guest: "guestName",
      housekeeper: "housekeeperName",
      attendant: "housekeeperName",
      floor: "floor",
      ...STAY_COLUMNS,
    },
    statuses: {
      di: hk("VACANT_DIRTY"),
      dirty: hk("VACANT_DIRTY"),
      cl: hk("VACANT_CLEAN"),
      clean: hk("VACANT_CLEAN"),
      pu: hk("VACANT_DIRTY"),
      pickup: hk("VACANT_DIRTY"),
      ip: hk("INSPECTED"),
      inspected: hk("INSPECTED"),
      oo: hk("OUT_OF_ORDER", "MAINTENANCE"),
      os: hk("OUT_OF_ORDER", "MAINTENANCE"),
      vac: stay("VACANT"),
      occ: stay("OCCUPIED"),
      dep: stay("DEPARTING"),
      arr: stay("ARRIVING"),
      so: stay("STAYOVER"),
      ...COMBINED,
      ...BLOCKED,
      ...STAY_WORDS,
    },
  },
  {
    id: "AUTOCLERK",
    label: "AutoClerk",
    columns: ["Room", "Room Type", "Status", "Occupancy"],
    optionalColumns: ["Guest Name", "Housekeeper", "Floor", "Check-In", "Check-Out", "Notes"],
    statusValues: ["CLN", "Clean", "DTY", "Dirty", "INS", "Inspected", "PUP", "Pickup", "OOO", "Out of Order", "OOS", "Out of Service"],
    guestValues: ["VAC", "Vacant", "OCC", "Occupied", "DEP", "Departing", "ARR", "Arriving", "SO", "Stayover", "Departed"],
    sample: [
      "Room,Room Type,Status,Occupancy,Guest Name",
      "101,KING,DTY,DEP,SMITH/JOHN",
      "102,QUEEN,CLN,SO,DOE/JANE",
      "103,KING,INS,VAC,",
      "104,QUEEN,OOO,VAC,",
    ].join("\n"),
    headers: {
      room: "roomNumber",
      roomnumber: "roomNumber",
      roomtype: "roomType",
      type: "roomType",
      status: "status",
      hkstatus: "status",
      housekeepingstatus: "status",
      occupancy: "guestStatus",
      occupancystatus: "guestStatus",
      guestname: "guestName",
      guest: "guestName",
      housekeeper: "housekeeperName",
      floor: "floor",
      ...STAY_COLUMNS,
    },
    statuses: {
      cln: hk("VACANT_CLEAN"),
      clean: hk("VACANT_CLEAN"),
      dty: hk("VACANT_DIRTY"),
      dirty: hk("VACANT_DIRTY"),
      ins: hk("INSPECTED"),
      inspected: hk("INSPECTED"),
      pup: hk("VACANT_DIRTY"),
      pickup: hk("VACANT_DIRTY"),
      vac: stay("VACANT"),
      occ: stay("OCCUPIED"),
      dep: stay("DEPARTING"),
      arr: stay("ARRIVING"),
      so: stay("STAYOVER"),
      ...COMBINED,
      ...BLOCKED,
      ...STAY_WORDS,
    },
  },
  {
    id: "VISUAL_MATRIX",
    label: "Visual Matrix",
    columns: ["Room", "Room Type", "Status", "FO Status"],
    optionalColumns: ["Maid", "Guest Name", "Floor", "Check-In", "Check-Out", "Notes"],
    statusValues: ["VD", "Vacant Dirty", "VC", "Vacant Clean", "OD", "Occupied Dirty", "OC", "Occupied Clean", "PU", "Pickup", "OOO", "Out of Order", "OOS", "Out of Service"],
    guestValues: ["VAC", "Vacant", "OCC", "Occupied", "DEP", "Due Out", "ARR", "Arrival", "Stayover", "Departed"],
    sample: [
      "Room,Room Type,Status,FO Status,Maid,Guest Name",
      "101,KING,VD,DEP,Maria,SMITH/JOHN",
      "102,QUEEN,OC,Stayover,Maria,DOE/JANE",
      "103,KING,VC,VAC,Maria,",
      "104,QUEEN,OOO,VAC,,",
    ].join("\n"),
    headers: {
      room: "roomNumber",
      roomnumber: "roomNumber",
      roomtype: "roomType",
      type: "roomType",
      status: "status",
      hkstatus: "status",
      fostatus: "guestStatus",
      frontofficestatus: "guestStatus",
      maid: "housekeeperName",
      housekeeper: "housekeeperName",
      guestname: "guestName",
      guest: "guestName",
      floor: "floor",
      ...STAY_COLUMNS,
    },
    statuses: {
      pu: hk("VACANT_DIRTY"),
      pickup: hk("VACANT_DIRTY"),
      vac: stay("VACANT"),
      occ: stay("OCCUPIED"),
      dep: stay("DEPARTING"),
      arr: stay("ARRIVING"),
      ...COMBINED,
      ...BLOCKED,
      ...STAY_WORDS,
    },
  },
  {
    id: "STAY_PMS",
    label: "Stay PMS",
    columns: ["Room Number", "Room Type", "Housekeeping Status", "Front Office Status"],
    optionalColumns: ["Reservation Status", "Guest Name", "Floor", "Check-In", "Check-Out", "Notes"],
    statusValues: ["Dirty", "Clean", "Inspected", "Pickup", "Out of Order", "Out of Service"],
    guestValues: ["Vacant", "Occupied", "Stayover", "Reserved", "Arrival", "Due Out", "Departed"],
    sample: [
      "Room Number,Room Type,Housekeeping Status,Front Office Status,Reservation Status,Guest Name",
      "101,KING,Dirty,Due Out,Occupied,SMITH/JOHN",
      "102,QUEEN,Clean,Stayover,Occupied,DOE/JANE",
      "103,KING,Inspected,Vacant,Vacant,",
      "104,QUEEN,Out of Order,Vacant,Vacant,",
    ].join("\n"),
    headers: {
      room: "roomNumber",
      roomnumber: "roomNumber",
      roomno: "roomNumber",
      roomtype: "roomType",
      type: "roomType",
      housekeepingstatus: "status",
      status: "status",
      frontofficestatus: "service",
      fostatus: "service",
      reservationstatus: "guestStatus",
      guestname: "guestName",
      guest: "guestName",
      floor: "floor",
      ...STAY_COLUMNS,
    },
    statuses: {
      dirty: hk("VACANT_DIRTY"),
      clean: hk("VACANT_CLEAN"),
      inspected: hk("INSPECTED"),
      pickup: hk("VACANT_DIRTY"),
      reserved: stay("ARRIVING"),
      ...COMBINED,
      ...BLOCKED,
      ...STAY_WORDS,
    },
  },
];

export function getReportPms(id: string | null | undefined) {
  if (!id) return null;
  return REPORT_PMS_LIST.find((profile) => profile.id === id) ?? null;
}

export function isReportRoomHeader(cell: string) {
  const key = normalizeReportKey(cell);
  return REPORT_PMS_LIST.some((profile) => profile.headers[key] === "roomNumber");
}
