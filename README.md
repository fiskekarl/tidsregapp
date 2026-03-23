# Time Registration Kiosk

SAP BTP kiosk app til tidsregistrering for produktionsmedarbejdere. Medarbejdere scanner eller indtaster deres ID på en delt kiosk-skærm og registrerer arbejdstid direkte i SAP S/4HANA via CATS API.

## Arkitektur

```
[UI5 Kiosk App] → [Approuter] → [CAP Node.js] → [S/4HANA CATS API]
                                      ↓
                               [HANA Cloud DB]
```

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | SAPUI5 (freestyle) |
| Backend | SAP CAP Node.js |
| Database | SAP HANA Cloud (HDI) |
| Auth | XSUAA |
| S/4 integration | OData v2 via Cloud Connector |

## Kom i gang

**Krav:** Node.js ≥ 18, `@sap/cds-dk`, Cloud Foundry CLI, MBT

```bash
npm install
npm run watch        # lokal udvikling (SQLite in-memory)
```

## Deploy til BTP

```bash
npm run build        # CDS build
npm run deploy       # mbt build + cf deploy
```

Eller manuelt:

```bash
mbt build
cf deploy mta_archives/time-registration_1.0.0.mtar
```

## BTP Services

- **SAP HANA Cloud** — HDI container til persistens
- **XSUAA** — autentificering og autorisation
- **Destination Service** — forbindelse til S/4HANA via Cloud Connector

## Struktur

```
├── app/kiosk/          # SAPUI5 kiosk frontend
│   └── webapp/
│       ├── controller/ # Idle + TimeEntry controllers
│       └── view/       # XML views
├── app/router/         # Approuter konfiguration
├── db/                 # CDS datamodel + seed data
├── srv/                # CAP service + S/4HANA adapter
│   ├── time-service.cds
│   ├── time-service.js
│   └── lib/s4-adapter.js
└── mta.yaml            # MTA deployment descriptor
```

## S/4HANA Integration

Appen poster tidsregistreringer til CATS API i S/4HANA via SAP Cloud Connector. Konfigurer destination `S4HANA_CATS` i BTP Destination Service — se [CLOUD_CONNECTOR.md](CLOUD_CONNECTOR.md) for opsætning.
