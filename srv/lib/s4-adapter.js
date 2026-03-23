'use strict';
/**
 * S/4HANA CATS-adapter
 * -------------------------------------------------
 * I dev/test: returnerer mock-svar
 * I produktion: kalder CATS_TIMESHEET_OD OData V2 via BTP Destination Service
 *
 * CATS OData endpoint (S/4HANA Cloud):
 *   /sap/opu/odata/sap/API_TIMESHEET/TimeSheetEntry
 *
 * Destination-navn i BTP: S4HANA_CATS  (konfigureres via Cloud Connector)
 */

const cds = require('@sap/cds');

// ---------------------------------------------------------------------------
// Hoved-funktion — kaldes fra time-service.js
// ---------------------------------------------------------------------------
async function postCatsEntry({
  employeeID,
  entryType,
  orderNumber,
  costCenter,
  startTime,
  endTime,
  durationMin,
}) {
  const isMock = process.env.S4_MOCK === 'true'
    || cds.env.requires?.s4?.kind === 'odata-v2-mock'
    || !cds.env.requires?.destinations;

  if (isMock) {
    return _mockPost({ employeeID, entryType, orderNumber, costCenter, durationMin });
  }

  return _realPost({ employeeID, entryType, orderNumber, costCenter, startTime, endTime, durationMin });
}

// ---------------------------------------------------------------------------
// Mock-implementering
// ---------------------------------------------------------------------------
async function _mockPost(data) {
  cds.log('s4-adapter').info('[MOCK] CATS entry sendt:', data);
  // Simuler netværksforsinkelse
  await new Promise(r => setTimeout(r, 200));
  return { CatsDocumentNumber: `MOCK-${Date.now()}`, Status: 'SUCCESS' };
}

// ---------------------------------------------------------------------------
// Rigtig S/4HANA implementering via Destination Service
// ---------------------------------------------------------------------------
async function _realPost({ employeeID, entryType, orderNumber, costCenter, startTime, endTime, durationMin }) {
  const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

  // Byg CATS-payload
  const workItem = _buildCatsPayload({ employeeID, entryType, orderNumber, costCenter, startTime, endTime, durationMin });

  const response = await executeHttpRequest(
    { destinationName: process.env.S4_DESTINATION_NAME || 'S4HANA_CATS' },
    {
      method:  'POST',
      url:     '/sap/opu/odata/sap/API_TIMESHEET/TimeSheetEntry',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      data: workItem,
    }
  );

  if (response.status >= 400) {
    throw new Error(`S/4 svarede ${response.status}: ${JSON.stringify(response.data)}`);
  }

  return response.data?.d;
}

// ---------------------------------------------------------------------------
// Byg CATS OData payload
// Tilpas felter til dit specifikke S/4-system når det kendes.
// ---------------------------------------------------------------------------
function _buildCatsPayload({ employeeID, entryType, orderNumber, costCenter, startTime, endTime, durationMin }) {
  const hours = (durationMin / 60).toFixed(2);

  const base = {
    PersonWorkAgreement: employeeID,
    CompanyCode:         process.env.S4_COMPANY_CODE || '1000',
    TimeSheetDate:       `/Date(${new Date(startTime).getTime()})/`,
    RecordedQuantity:    hours,
    HoursUnitOfMeasure:  'H',
    TimeSheetStatus:     '30',   // 30 = Posted
    TimeSheetIsReleasedOnSave: true,
  };

  // Kobl timeregistrering til det rigtige objekt
  if (entryType === 'ORDER' && orderNumber) {
    return { ...base, OrderID: orderNumber, ActivityType: process.env.S4_DEFAULT_ACTIVITY || 'PROD' };
  }
  if (entryType === 'COSTCENTER' && costCenter) {
    return { ...base, CostCenter: costCenter, ActivityType: process.env.S4_DEFAULT_ACTIVITY || 'PROD' };
  }
  // CLOCKINOUT — registrér på medarbejderens hjemkoststed
  return { ...base, ActivityType: process.env.S4_DEFAULT_ACTIVITY || 'ATTN' };
}

module.exports = { postCatsEntry };
