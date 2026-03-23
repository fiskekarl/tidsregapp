// Ekstern S/4HANA CATS OData V2 service — minimal model til CAP-integration
// Produktionsfelter: tilpas til dit specifikke S/4-system når det kendes.

@cds.external: true
service CATS_API {

  entity TimeSheetEntry {
    key TimeSheetRecord         : String(12);
        PersonWorkAgreement     : String(8);
        CompanyCode             : String(4);
        TimeSheetDate           : String(8);    // YYYYMMDD (OData V2 /Date()/)
        RecordedQuantity        : Decimal(7,2);
        HoursUnitOfMeasure      : String(3);
        TimeSheetStatus         : String(2);    // 10=In process, 20=Released, 30=Posted
        TimeSheetIsReleasedOnSave : Boolean;
        OrderID                 : String(12);
        CostCenter              : String(10);
        ActivityType            : String(6);
  };

  action CreateTimeSheetEntry(entry: TimeSheetEntry) returns TimeSheetEntry;
}
