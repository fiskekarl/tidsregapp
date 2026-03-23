using { com.timeregistration as db } from '../db/schema';

@requires: 'authenticated-user'
service TimeService @(path: '/api/time') {

  // -------------------------------------------------------------------------
  // Kiosk actions — TimeUser scope
  // -------------------------------------------------------------------------

  @restrict: [{ grant: 'EXECUTE', to: 'TimeUser' }]
  action login(token: String, employeeID: String)
    returns {
      sessionId  : UUID;
      employeeID : String;
      fullName   : String;
      costCenter : String;
    };

  @restrict: [{ grant: 'EXECUTE', to: 'TimeUser' }]
  action keepAlive(sessionId: UUID) returns Boolean;

  @restrict: [{ grant: 'EXECUTE', to: 'TimeUser' }]
  action logout(sessionId: UUID, reason: String) returns Boolean;

  @restrict: [{ grant: 'EXECUTE', to: 'TimeUser' }]
  action startEntry(
    sessionId    : UUID,
    entryType    : String,
    orderNumber  : String,
    costCenterNo : String
  ) returns UUID;

  @restrict: [{ grant: 'EXECUTE', to: 'TimeUser' }]
  action stopEntry(entryId: UUID) returns {
    durationMin : Integer;
    s4Status    : String;
    s4Message   : String;
  };

  // -------------------------------------------------------------------------
  // Read-only views — TimeAdmin scope
  // -------------------------------------------------------------------------

  @restrict: [{ grant: 'READ', to: 'TimeAdmin' }]
  entity Employees  as projection on db.Employees  excluding { RfidToken };

  @restrict: [{ grant: 'READ', to: 'TimeAdmin' }]
  entity Sessions   as projection on db.Sessions;

  @restrict: [{ grant: 'READ', to: 'TimeAdmin' }]
  entity TimeEntries as projection on db.TimeEntries;
}
