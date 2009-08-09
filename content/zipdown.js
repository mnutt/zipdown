const nsIZipReader = Components.interfaces.nsIZipReader;

var MyDownloadManager = {
  defaultCreateDownloadItem : null,

  init : function fdm_init() {
    for(var w in window) {
      try {
	window[w].toString();
      } catch(e) {}
    }
    zipdownListener = new ZipdownListener(window._firebug);
    gDownloadManager.addListener(zipdownListener);
    gDownloadsView.addEventListener("DOMNodeInserted", updateExistingItem, false);
  }
};

function getLocalFileFromNativePathOrUrl(aPathOrUrl)
{
  if (aPathOrUrl.substring(0,7) == "file://") {
    // if this is a URL, get the file from that
    let ioSvc = Cc["@mozilla.org/network/io-service;1"].
                getService(Ci.nsIIOService);

    // XXX it's possible that using a null char-set here is bad
    const fileUrl = ioSvc.newURI(aPathOrUrl, null, null).
                    QueryInterface(Ci.nsIFileURL);
    return fileUrl.file.clone().QueryInterface(Ci.nsILocalFile);
  } else {
    // if it's a pathname, create the nsILocalFile directly
    var f = new nsLocalFile(aPathOrUrl);

    return f;
  }
}

function toggleList(toggler) {
  var listItem = toggler.parentNode.parentNode.parentNode.parentNode;
  var expanded = (listItem.getAttribute('expanded') == "true");
  if(expanded) {
    listItem.setAttribute('expanded', "false");
  } else {
    createListBox(listItem);
    listItem.setAttribute('expanded', "true");
  }

  return false;
}

function createListBox(item) {
  if(item.getElementsByTagName('listbox').length > 0) { return false; }

  var files = readEntriesFromZipPath(item.getAttribute('file'));

  var listBox = document.createElement('listbox');
  var maxRows = Math.min(20, files.length);
  listBox.setAttribute("rows", maxRows);

  for(var i in files) {
    var file = files[i];
    var fileItem = document.createElement('listitem');
    fileItem.setAttribute('label', file);
    listBox.appendChild(fileItem);
  }

  item.appendChild(listBox);
}

function updateExistingItem(item) {
  var files = readEntriesFromZipPath(item.target.getAttribute('file'));
  item.target.setAttribute("itemCount", files.length + " items");
}

function readEntriesFromZipPath(path) {
  var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
  var file = getLocalFileFromNativePathOrUrl(path);
  mZipReader.open(file);

  var entries = mZipReader.findEntries(null);
  var files = [];
  while (entries.hasMore()) {
    files.push(entries.getNext());
  }
  return files;
}

window.addEventListener("load", function(e) { MyDownloadManager.init(); }, false);
