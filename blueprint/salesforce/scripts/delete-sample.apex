// Deletes the sample so it can be reloaded cleanly. Children first, then parents.
// Run: sf apex run --target-org cloud-cruz --file scripts/delete-sample.apex
List<String> objects = new List<String>{
  'Implementation_Package__c', 'Commission_Accrual__c', 'Credential__c', 'Deal_Registration__c',
  'Opportunity_Partner__c', 'Partner_Touch__c', 'Opportunity', 'Contact', 'Lead', 'Account'
};
for (String name : objects) {
  List<SObject> rows = Database.query('SELECT Id FROM ' + name + ' LIMIT 9000');
  Integer ok = 0;
  for (Database.DeleteResult r : Database.delete(rows, false)) if (r.isSuccess()) ok++;
  System.debug(LoggingLevel.ERROR, 'SAMPLE DELETED ' + name + ' ' + ok + ' of ' + rows.size());
}
