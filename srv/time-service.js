'use strict';
const cds = require('@sap/cds');
const s4Adapter = require('./lib/s4-adapter');

module.exports = class TimeService extends cds.ApplicationService {

  async init() {
    const { Employees, Sessions, TimeEntries } = this.entities;

    // -----------------------------------------------------------------------
    // login — RFID token ELLER EmployeeID
    // -----------------------------------------------------------------------
    this.on('login', async (req) => {
      const { token, employeeID } = req.data;

      if (!token && !employeeID)
        req.reject(400, 'Angiv enten RFID-token eller medarbejder-ID');

      // Find medarbejder
      const where = token ? { RfidToken: token } : { EmployeeID: employeeID };
      const emp = await SELECT.one.from(Employees).where(where);

      if (!emp)          req.reject(404, 'Medarbejder ikke fundet');
      if (!emp.IsActive) req.reject(403, 'Medarbejder er deaktiveret');

      // Afslut eventuel eksisterende aktiv session for samme medarbejder
      await UPDATE(Sessions)
        .set({ Status: 'TIMEOUT' })
        .where({ Employee_EmployeeID: emp.EmployeeID, Status: 'ACTIVE' });

      // Opret ny session
      const now = new Date().toISOString();
      const sessionId = cds.utils.uuid();
      await INSERT.into(Sessions).entries({
        ID:                    sessionId,
        Employee_EmployeeID:   emp.EmployeeID,
        LoginTime:             now,
        LastActivity:          now,
        Status:                'ACTIVE',
      });

      return {
        sessionId:  sessionId,
        employeeID: emp.EmployeeID,
        fullName:   emp.FullName,
        costCenter: emp.CostCenter,
      };
    });

    // -----------------------------------------------------------------------
    // keepAlive — reset LastActivity
    // -----------------------------------------------------------------------
    this.on('keepAlive', async (req) => {
      const { sessionId } = req.data;
      const session = await _activeSession(Sessions, sessionId, req);

      await UPDATE(Sessions)
        .set({ LastActivity: new Date().toISOString() })
        .where({ ID: sessionId });

      return true;
    });

    // -----------------------------------------------------------------------
    // logout
    // -----------------------------------------------------------------------
    this.on('logout', async (req) => {
      const { sessionId, reason } = req.data;
      await _activeSession(Sessions, sessionId, req);

      const status = reason === 'TIMEOUT' ? 'TIMEOUT' : 'LOGOUT';
      await UPDATE(Sessions).set({ Status: status }).where({ ID: sessionId });

      // Stop evt. åbne tidsregistreringer
      const openEntries = await SELECT.from(TimeEntries).where({
        Session_ID: sessionId,
        EndTime:    null,
      });
      for (const e of openEntries) {
        await _doStopEntry(e, TimeEntries);
      }

      return true;
    });

    // -----------------------------------------------------------------------
    // startEntry
    // -----------------------------------------------------------------------
    this.on('startEntry', async (req) => {
      const { sessionId, entryType, orderNumber, costCenterNo } = req.data;
      const session = await _activeSession(Sessions, sessionId, req);

      // Valider obligatoriske felter pr. type
      if (entryType === 'ORDER' && !orderNumber)
        req.reject(400, 'Ordrenummer er påkrævet for produktionsordre');
      if (entryType === 'COSTCENTER' && !costCenterNo)
        req.reject(400, 'Omkostningscenter er påkrævet');

      // Afslut evt. allerede åben registrering i sessionen
      const openEntry = await SELECT.one.from(TimeEntries).where({
        Session_ID: sessionId,
        EndTime:    null,
      });
      if (openEntry) await _doStopEntry(openEntry, TimeEntries);

      const entryId = cds.utils.uuid();
      await INSERT.into(TimeEntries).entries({
        ID:                   entryId,
        Employee_EmployeeID:  session.Employee_EmployeeID,
        Session_ID:           sessionId,
        EntryType:            entryType || 'CLOCKINOUT',
        OrderNumber:          orderNumber  || null,
        CostCenterNo:         costCenterNo || null,
        StartTime:            new Date().toISOString(),
        S4Status:             'PENDING',
      });

      return entryId;
    });

    // -----------------------------------------------------------------------
    // stopEntry — afslut + synk til S/4
    // -----------------------------------------------------------------------
    this.on('stopEntry', async (req) => {
      const { entryId } = req.data;
      const entry = await SELECT.one.from(TimeEntries).where({ ID: entryId });
      if (!entry) req.reject(404, 'Tidsregistrering ikke fundet');

      const result = await _doStopEntry(entry, TimeEntries);

      // Synk til S/4HANA (eller mock)
      try {
        await s4Adapter.postCatsEntry({
          employeeID:   entry.Employee_EmployeeID,
          entryType:    entry.EntryType,
          orderNumber:  entry.OrderNumber,
          costCenter:   entry.CostCenterNo,
          startTime:    entry.StartTime,
          endTime:      result.endTime,
          durationMin:  result.durationMin,
        });
        await UPDATE(TimeEntries)
          .set({ S4Status: 'SYNCED' })
          .where({ ID: entryId });
        result.s4Status  = 'SYNCED';
        result.s4Message = '';
      } catch (err) {
        const msg = err.message || 'S/4 fejl';
        await UPDATE(TimeEntries)
          .set({ S4Status: 'ERROR', S4Message: msg })
          .where({ ID: entryId });
        result.s4Status  = 'ERROR';
        result.s4Message = msg;
      }

      return result;
    });

    return super.init();
  }
};

// ---------------------------------------------------------------------------
// Hjælpefunktioner
// ---------------------------------------------------------------------------

async function _activeSession(Sessions, sessionId, req) {
  const session = await SELECT.one.from(Sessions).where({ ID: sessionId, Status: 'ACTIVE' });
  if (!session) req.reject(404, 'Aktiv session ikke fundet — log ind igen');
  return session;
}

async function _doStopEntry(entry, TimeEntries) {
  const endTime     = new Date().toISOString();
  const durationMin = Math.round((Date.now() - new Date(entry.StartTime).getTime()) / 60000);

  await UPDATE(TimeEntries)
    .set({ EndTime: endTime, DurationMin: durationMin })
    .where({ ID: entry.ID });

  return { endTime, durationMin };
}
