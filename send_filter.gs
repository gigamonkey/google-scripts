/*
 * Send an email with an attached list of all your google groups' email addresses.
 * The idea is you use this function to get a list of all the email addresses of
 * groups you are described to and then you organize them into a list of lists as
 * documented below at sendFilters, and assign that to a variable 'groups'.
 */
function sendGroupList() {
  GmailApp.sendEmail(
    me(),
    "Your Google groups",
    "You are in the attached list of groups.",
    {
      attachments: [
        Utilities.newBlob(groupEmails().join("\n") + "\n", 'text/plain', 'groups.txt')
      ]
    });
}

/*
 * Send an XML file that can be imported as filters for all your groups.
 * Creates the necessary labels as well.
 *
 * The groups argument comes from another file but is organized like:
 *
 * var groups = [
 *   ['Foo',
 *    'some-group@twitter.com',
 *    'another-group@twitter.com',
 *   ],
 *   ['Bar',
 *    'a-bar-list@twitter.com',
 *    'outside-list@googlegroups.com',
 *   ]];
 *
 * where 'Foo' and 'Bar' are top-level labels that will actually get
 * created as '01. Foo' and '02. Bar' so they show up in the right order.
 * Under each top-level group, each email will be made into a label
 * without the '@twitter.com' suffix but with ' @ otherdomain' when
 * necessary.
 */
function sendFilters() {
  var fs = filters(groups);
  ensureLabels(fs);
  createGroupsFilters(fs);
}

function me() { return Session.getActiveUser().getEmail(); }

function groupEmails() {
  var emails = [];
  var groups = GroupsApp.getGroups();
  for (var i = 0; i < groups.length; i++) {
    emails.push(groups[i].getEmail());
  }
  return emails;
}

function filters(groups) {
  function xx(n) { return n < 10 ? '0' + n : '' + n; }
  var fs = [];
  var id = Date.now();
  fs.push({ email: me(), top: null, label: '00. Me', id: id++ });
  for (var i = 0; i < groups.length; i++) {
    var toplevel = groups[i];
    var top = xx(i+1) + '. ' + toplevel[0];
    for (var j = 1; j < toplevel.length; j++) {
      var email = toplevel[j];
      var address = email.split('@');
      var label = top + '/' + address[0] + (address[1] == 'twitter.com' ? '' : (' @ ' + address[1].split('.')[0]));
      fs.push({ email: email, top: top, label: label, id: id++ });
    }
  }
  return fs;
}

function ensureLabels(filters) {
  var seen = {};
  for (var i = 0; i < filters.length; i++) {
    var f = filters[i];
    if (f.top && !seen[f.top]) {
      // Ensure will only create the label once but seems like this
      // is probably cheaper than talking to Gmail to find out that,
      // indeed, the thing we just created exists.
      ensureLabel(f.top);
      seen[f.top] = true;
    }
    ensureLabel(f.label);
  }
}

function ensureLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function createGroupsFilters(filters) {
  var atom = XmlService.getNamespace('http://www.w3.org/2005/Atom');
  var apps = XmlService.getNamespace('apps', 'http://schemas.google.com/apps/2006');

  function el(name) { return XmlService.createElement(name, atom); }
  
  function property(name, value) {
    return XmlService.createElement('property', apps)
    .setAttribute('name', name)
    .setAttribute('value', value);
  }
  
  function entry(serial, to, label) {
    return el('entry')
    .addContent(el('category').setAttribute('term', 'filter'))
    .addContent(el('title').setText('Mail Filter'))
    .addContent(el('id').setText('tag:mail.google.com,2008:filter:' + serial))
    .addContent(el('updated').setText(new Date().toISOString()))
    .addContent(el('content'))
    .addContent(property('to', to))
    .addContent(property('label', label))
    .addContent(property('shouldArchive', 'true'))
    .addContent(property('sizeOperator', 's_sl'))
    .addContent(property('sizeUnit', 's_smb'));
  }
   
  function makeRootTag(filters) {
    var ids = [];
    for (var i = 0; i < filters.length; i++) {
      ids.push(filters[i].id);
    }
    return 'tag:mail.google.com,2008:filters:' + (ids.join(','));
  }

  function addEntries(root, filters) {
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      root.addContent(entry(f.id, f.email, f.label));
    }
  }
  
  var root = el('feed')
  .addContent(el('title').setText('Mail Filters'))
  .addContent(el('id').setText(makeRootTag(filters)))
  .addContent(el('updated').setText(new Date().toISOString()))
  .addContent(el('author')
              .addContent(el('name').setText('Magic Filters'))
              .addContent(el('email').setText(me())));
  addEntries(root, filters);
  
  var xml = XmlService.getPrettyFormat().format(XmlService.createDocument(root));
  var a = Utilities.newBlob(xml, 'text/xml', 'filters.xml');
  GmailApp.sendEmail(me(), "Gmail Filters For You!", "Here are your filters.", { attachments: [a] });
 }
