const nsIZipReader = Components.interfaces.nsIZipReader;

var MyDownloadManager = {
  defaultCreateDownloadItem : null,

  init : function fdm_init() {
    // Really weird hack to make window._firebug.log work
    for(var w in window) {
      try {
	window[w].toString();
      } catch(e) {}
    }

    // Catch new downloads as they appear
    zipdownListener = new ZipdownListener();
    gDownloadManager.addListener(zipdownListener);

    // Catch existing downloads as they are rendered
    gDownloadsView.addEventListener("DOMNodeInserted", updateExistingItem, false);

    gDownloadsView.addEventListener("click", deselectTree, false);
    gDownloadsView.addEventListener("click", toggleList, false);
    gDownloadsView.addEventListener("dblclick", ignoreToggle, true);
  }
};

function toggleList(event) {
  if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
    var listItem = event.originalTarget.parentNode.parentNode.parentNode.parentNode;
    var expanded = (listItem.getAttribute('expanded') == "true");

    // In some instances the parent item loses focus
    listItem.parentNode.focus();

    if(expanded) {
      listItem.setAttribute('expanded', "false");
    } else {
      // The first time the archive is expanded, create the contents tree
      createZipTree(listItem);

      listItem.setAttribute('expanded', "true");
    }
  }
}

function createZipTree(item) {
  if(item.getElementsByTagName('tree').length > 0) { return false; }

  var files = readEntriesFromZipPath(item.getAttribute('file'));

  var tree = document.getElementById("zipCollectionTemplate").children[0].cloneNode(true);
  tree.setAttribute("rows", files.length);
  var treeChildren = tree.getElementsByTagName("treechildren")[0];

  for(var i in files) {
    var file = files[i];
    var fileItem = document.getElementById('zipItemTemplate').
                   getElementsByTagName('treeitem')[0].cloneNode(true);

    var fileCell = fileItem.getElementsByTagName('treecell')[0];
    fileCell.setAttribute('label', file);

    treeChildren.appendChild(fileItem);
  }

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

      event.dataTransfer.mozSetDataAt("application/x-moz-file", f, 0);
    } catch(e) {
      alert(e);
    }
  }
};

function getClickedTreeChildFromContextMenu() {
  var row = document.popupNode._lastSelectedRow;
  var treeChildren = document.popupNode;
  return treeChildren.children[row];
}

function cmd_zipfileOpen(click) {
  var treeChild = getClickedTreeChildFromContextMenu();
  var zipItem = treeChild.parentNode.parentNode.parentNode;
  var path = treeChild.children[0].children[0].getAttribute("label");
  openFileFromZip(zipItem.getAttribute("file"), path);
}

function cmd_zipfileShow(click) {
  var treeChild = getClickedTreeChildFromContextMenu();
  var zipItem = treeChild.parentNode.parentNode.parentNode;
  var path = treeChild.children[0].children[0].getAttribute("label");
  openFileFromZip(zipItem.getAttribute("file"), path, true);
}

window.addEventListener("load", function(e) { MyDownloadManager.init(); }, false);
