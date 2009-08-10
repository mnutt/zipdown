const nsIZipReader = Components.interfaces.nsIZipReader;

var MyDownloadManager = {
  defaultCreateDownloadItem : null,

  init : function fdm_init() {
    for(var w in window) {
      try {
	window[w].toString();
      } catch(e) {}
    }
    zipdownListener = new ZipdownListener();
    gDownloadManager.addListener(zipdownListener);
    gDownloadsView.addEventListener("DOMNodeInserted", updateExistingItem, false);
    gDownloadsView.addEventListener("click", deselectTree, false);
    gDownloadsView.addEventListener("click", toggleList, false);
    gDownloadsView.addEventListener("dblclick", ignoreToggle, true);
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

function toggleList(event) {
  if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
    var listItem = event.originalTarget.parentNode.parentNode.parentNode.parentNode;
    var expanded = (listItem.getAttribute('expanded') == "true");
    listItem.parentNode.focus();
    if(expanded) {
      listItem.setAttribute('expanded', "false");
    } else {
      createListBox(listItem);
      listItem.setAttribute('expanded', "true");
    }
  }
}

function createListBox(item) {
  if(item.getElementsByTagName('tree').length > 0) { return false; }

  var files = readEntriesFromZipPath(item.getAttribute('file'));

  var tree = document.createElement('tree');
  tree.setAttribute("ondblclick", "onTreeClicked(event);");
  tree.setAttribute("hidecolumnpicker", "true");
  tree.setAttribute("ondraggesture", "nsDragAndDrop.startDrag(event,fileDragObserver);");
  tree.setAttribute("context", "zipfilepopup");
  var maxRows = Math.min(20, files.length);
  tree.setAttribute("rows", files.length);
  var treeChildren = document.createElement('treechildren');
  var treeCols = document.createElement('treecols');
  treeCols.setAttribute("orient", "horizontal");
  var treeCol = document.createElement('treecol');
  treeCol.setAttribute("label", "Files");
  treeCol.setAttribute("id", "filename");
  treeCol.setAttribute('flex', "1");
  treeCol.setAttribute("hideheader", "true");
  treeCols.appendChild(treeCol);
  tree.appendChild(treeCols);

  for(var i in files) {
    var file = files[i];
    var fileItem = document.createElement('treeitem');
    var fileRow = document.createElement('treerow');
    var fileCell = document.createElement('treecell');
    fileCell.setAttribute('label', file);
    fileRow.appendChild(fileCell);
    fileItem.appendChild(fileRow);
    treeChildren.appendChild(fileItem);
  }

  tree.appendChild(treeChildren);
  item.appendChild(tree);
}

function updateExistingItem(item) {
  if(item.target.getAttribute('file').split('.')[item.target.getAttribute('file').split('.').length-1] == "zip") {
    var files = readEntriesFromZipPath(item.target.getAttribute('file'));
    item.target.setAttribute("zip", "true");
    item.target.setAttribute("itemCount", files.length + " items");
  }
}

function deselectTree(event) {
  if(event.explicitOriginalTarget.tagName == "richlistitem" || event.originalTarget.tagName == "treechildren") {
    var trees = gDownloadsView.getElementsByTagName('tree');

    if(trees.length > 0) {
      for(var i in trees) {
	var tree = trees[i];
	if(typeof(tree.view) == "undefined" || tree.view == null) { continue; }
	if(event.originalTarget.parentNode == tree) { continue; }
	tree.view.selection.clearSelection();
      }
    } else { return; }

  }
}

function readEntriesFromZipPath(path) {
  var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
  var file = getLocalFileFromNativePathOrUrl(path);
  mZipReader.open(file);

  var entries = mZipReader.findEntries(null);
  var files = [];
  while (entries.hasMore()) {
    var filepath = entries.getNext();
    if(filepath.match(/\.app\/.+/)) { continue; }
    files.push(filepath);
  }
  return files;
}

function openFileFromZip(zip, path, show) {
  var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
  var zipFile = getLocalFileFromNativePathOrUrl(zip);

  var isDirectory = false;
  if(path.match(/\/$/)) {
    path = path.replace(/\/$/, '');
    isDirectory = true;
  }

  var f = Components.classes["@mozilla.org/file/directory_service;1"].
             getService(Components.interfaces.nsIProperties).
             get("TmpD", Components.interfaces.nsILocalFile);
  f.append(path.split('/')[path.split('/').length-1]);

  // Remove an existing tmp file if it already exists
  if(f.exists(f.path)) {
    f.remove(f.path);
  }

  if(isDirectory) {
    f.createUnique(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0777);
  } else {
    f.createUnique(Components.interfaces.nsILocalFile.NORMAL_FILE_TYPE, 0666);
  }

  mZipReader.open(zipFile);
  if(isDirectory) {
    mZipReader.extract(path+"/", f);
  } else {
    mZipReader.extract(path, f);
  }

  if (f.isExecutable()) {
    var dontAsk = false;
    var pref = Cc["@mozilla.org/preferences-service;1"].
               getService(Ci.nsIPrefBranch);
    try {
      dontAsk = !pref.getBoolPref(PREF_BDM_ALERTONEXEOPEN);
    } catch (e) { }

    if (!dontAsk) {
      var strings = document.getElementById("downloadStrings");
      var name = aDownload.getAttribute("target");
      var message = strings.getFormattedString("fileExecutableSecurityWarning", [name, name]);

      let title = gStr.fileExecutableSecurityWarningTitle;
      let dontAsk = gStr.fileExecutableSecurityWarningDontAsk;

      var promptSvc = Cc["@mozilla.org/embedcomp/prompt-service;1"].
                      getService(Ci.nsIPromptService);
      var checkbox = { value: false };
      var open = promptSvc.confirmCheck(window, title, message, dontAsk, checkbox);

      if (!open)
        return;
      pref.setBoolPref(PREF_BDM_ALERTONEXEOPEN, !checkbox.value);
    }
  }
  try {
    if(show) {
      f.reveal();
    } else {
      f.launch();
    }
  } catch (ex) {
    // if launch fails, try sending it through the system's external
    // file: URL handler
    openExternal(f);
  }
}

function onTreeClicked(event){
  var tree = event.currentTarget;
  if(typeof(tree) == "undefined") { return; }

  var tbo = tree.treeBoxObject;

  // get the row, col and child element at the point
  var row = { }, col = { }, child = { };
  tbo.getCellAt(event.clientX, event.clientY, row, col, child);
  var filename = tree.view.getCellText(row.value, col.value);

  var zipname = tree.parentNode.getAttribute("file");

  openFileFromZip(zipname, filename);
  return false;
}

function ignoreToggle(event) {
  if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
    event.cancelBubble = true;
    return false;
  }
}

var fileDragObserver = {
  onDragStart: function(event, transferData, action) {
    try {
    var tree = event.currentTarget;
    var tbo = tree.treeBoxObject;

    // get the row, col and child element at the point
    var row = { }, col = { }, child = { };
    tbo.getCellAt(event.clientX, event.clientY, row, col, child);
    var path = tree.view.getCellText(row.value, col.value);
    var zip = tree.parentNode.getAttribute("file");

    var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
    var zipFile = getLocalFileFromNativePathOrUrl(zip);
    var f = Components.classes["@mozilla.org/file/directory_service;1"].
            getService(Components.interfaces.nsIProperties).
            get("TmpD", Components.interfaces.nsILocalFile);
    f.append(path.split('/')[path.split('/').length-1]);
    f.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);

    mZipReader.open(zipFile);
    mZipReader.extract(path, f);


    transferData.data = new TransferData();
      // transferData.data.addDataForFlavour("application/x-moz-file", f, 0);
      //event.dataTransfer.dropEffect = "copy";
      //event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.mozSetDataAt("application/x-moz-file", f, 0);
    } catch(e) {
      alert(e);
    }
  }
};

function cmd_zipfileOpen(click) {
  var row = document.popupNode._lastSelectedRow;
  var treeChildren = document.popupNode;
  var zipItem = treeChildren.parentNode.parentNode;
  var path = treeChildren.children[row].children[0].children[0].getAttribute("label");
  openFileFromZip(zipItem.getAttribute("file"), path);
}

function cmd_zipfileShow(click) {
  var row = document.popupNode._lastSelectedRow;
  var treeChildren = document.popupNode;
  var zipItem = treeChildren.parentNode.parentNode;
  var path = treeChildren.children[row].children[0].children[0].getAttribute("label");
  openFileFromZip(zipItem.getAttribute("file"), path, true);
}

window.addEventListener("load", function(e) { MyDownloadManager.init(); }, false);
