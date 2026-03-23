# Cloud Connector — Opsætning til S/4HANA

## Forudsætninger
- SAP Cloud Connector installeret på on-premise server (eller i samme netværk som S/4)
- BTP Subaccount: `trial` / `409c493dtrial`

## Trin 1 — Forbind Cloud Connector til BTP

1. Åbn Cloud Connector UI: `https://<din-server>:8443`
2. **Add Subaccount**:
   - Region: `cf.us10-001.hana.ondemand.com`
   - Subaccount: `409c493dtrial`
   - Login med din BTP-bruger

## Trin 2 — Tilføj on-premise system (S/4HANA)

1. Gå til **Cloud To On-Premise** → **Access Control**
2. Klik **+** og udfyld:
   | Felt | Værdi |
   |---|---|
   | Back-end Type | `ABAP System` |
   | Protocol | `HTTPS` (eller `HTTP` hvis intern) |
   | Internal Host | `<s4-server-hostname>` |
   | Internal Port | `443` (eller `8000`) |
   | Virtual Host | `s4hana` |
   | Virtual Port | `443` |
3. Tilføj ressource:
   - URL Path: `/sap/opu/odata/sap/API_TIMESHEET/`
   - Access Policy: `Path and all sub-paths`

## Trin 3 — Opret Destination i BTP

1. BTP Cockpit → Subaccount → **Connectivity** → **Destinations** → **New Destination**:

```
Name:                  S4HANA_CATS
Type:                  HTTP
URL:                   https://s4hana:443
Proxy Type:            OnPremise
Authentication:        BasicAuthentication
User:                  <RFC-bruger i S/4>
Password:              <password>
```

2. Tilføj Additional Properties:
   - `sap-client` = `100` (dit mandantnummer)
   - `WebIDEEnabled` = `true`

## Trin 4 — Sæt miljøvariabel i CAP

I BTP Cloud Foundry (eller `.env` lokalt):
```
S4_DESTINATION_NAME=S4HANA_CATS
S4_COMPANY_CODE=1000
S4_DEFAULT_ACTIVITY=PROD
S4_MOCK=false
```

## Test

```bash
# Test destination fra BTP
cf env time-registration-srv   # Se om destination er bundet

# Test CATS API direkte (kræver CAP kørende)
curl -X POST http://localhost:4004/api/time/startEntry \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"...","entryType":"ORDER","orderNumber":"000001"}'
```

## CATS OData felter (reference)

| CAP-felt | CATS OData-felt | Bemærkning |
|---|---|---|
| employeeID | PersonWorkAgreement | SAP Personalnummer |
| durationMin | RecordedQuantity (i timer) | Konverteres: min/60 |
| orderNumber | OrderID | Kun ved type ORDER |
| costCenterNo | CostCenter | Kun ved type COSTCENTER |
| startTime | TimeSheetDate | Dato for registreringen |
