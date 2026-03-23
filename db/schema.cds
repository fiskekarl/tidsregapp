namespace com.timeregistration;

using { cuid, managed } from '@sap/cds/common';

// ---------------------------------------------------------------------------
// Medarbejdere — synkroniseres fra SAP S/4HANA (eller vedligeholdes manuelt)
// ---------------------------------------------------------------------------
entity Employees {
  key EmployeeID   : String(12);       // SAP Personalnummer
      RfidToken    : String(64);       // HID keyboard wedge — råt kortindhold
      FullName     : String(80);
      CostCenter   : String(10);       // Hjemkoststed
      IsActive     : Boolean default true;
}

// ---------------------------------------------------------------------------
// Aktive kiosk-sessioner (én pr. medarbejder ad gangen)
// ---------------------------------------------------------------------------
entity Sessions : cuid {
  Employee     : Association to Employees;
  LoginTime    : Timestamp @cds.on.insert: $now;
  LastActivity : Timestamp @cds.on.insert: $now;
  Status       : String(10) enum {
    ACTIVE   = 'ACTIVE';
    TIMEOUT  = 'TIMEOUT';
    LOGOUT   = 'LOGOUT';
  } default 'ACTIVE' @assert.range;
}

// ---------------------------------------------------------------------------
// Tidsregistreringer
// ---------------------------------------------------------------------------
entity TimeEntries : cuid {
  Employee      : Association to Employees;
  Session       : Association to Sessions;
  EntryType     : String(12) enum {
    CLOCKINOUT  = 'CLOCKINOUT';    // Simpel stempling ind/ud
    ORDER       = 'ORDER';          // Produktionsordre
    COSTCENTER  = 'COSTCENTER';    // Omkostningscenter
  } @assert.range;
  OrderNumber   : String(12);      // Udfyldes ved EntryType = ORDER
  CostCenterNo  : String(10);      // Udfyldes ved EntryType = COSTCENTER
  StartTime     : Timestamp;
  EndTime       : Timestamp;
  DurationMin   : Integer;         // Beregnes ved stop
  S4Status      : String(10) enum {
    PENDING = 'PENDING';
    SYNCED  = 'SYNCED';
    ERROR   = 'ERROR';
  } default 'PENDING' @assert.range;
  S4Message     : String(256);     // Fejlbesked fra S/4 hvis relevant
}
