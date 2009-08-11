const nsIZipReader = Components.interfaces.nsIZipReader;

var ZipDown = {
  init : function() {
    // Really weird hack to make window._firebug.log work
    for(var w in window) {
      try {
	window[w].toString();
      } catch(e) {}
    }

    // Catch new downloads as they appear
    var zipdownListener = new ZipdownListener();
    gDownloadManager.addListener(zipdownListener);

    // Catch existing downloads as they are rendered
    gDownloadsView.addEventListener("DOMNodeInserted", this.updateExistingItem, false);

    gDownloadsView.addEventListener("click", this.events.deselectTreeRows, false);
    gDownloadsView.addEventListener("click", this.events.clickTwistyOrLabel, false);
    gDownloadsView.addEventListener("dblclick", this.events.ignoreToggle, true);
    gDownloadsView.addEventListener("dblclick", this.events.doubleClickTree, true);
  },

  events: {
    clickTwistyOrLabel: function(event) {
      if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
	var listItem = event.originalTarget.parentNode.parentNode.parentNode.parentNode;
	ZipDown.toggleZipList(listItem);
      }
    },

    // If a regular download is selected, deselect any sub-items of any download
    deselectTreeRows: function(event) {
      if(event.explicitOriginalTarget.tagName == "richlistitem" || event.originalTarget.tagName == "treechildren") {
	var trees = gDownloadsView.getElementsByTagName('tree');

	if(trees.length > 0) {
	  for(var i in trees) {
	    var tree = trees[i];
	    if(typeof(tree.view) == "undefined" || tree.view == null) { continue; }
	    if(event.originalTarget.parentNode == tree) { continue; }
	    tree.view.selection.clearSelection();
	  }
	}
      }
    },

    // Don't try to call the default double click action if we're clicking on the twisty or
    // label.  This allows rapid expanding/collapsing.
    ignoreToggle: function(event) {
      if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
	event.cancelBubble = true;
	return false;
      }
    },

    // Default action when double clicking an item in the tree is to try to launch it
    doubleClickTree: function(event) {
      if(event.originalTarget.tagName == "treechildren") {
	var tree = event.originalTarget.parentNode;
	if(typeof(tree) == "undefined") { return; }

	var tbo = tree.treeBoxObject;

	// get the row, col and child element at the point
	var row = { }, col = { }, child = { };
	tbo.getCellAt(event.clientX, event.clientY, row, col, child);

	ZipDown.openTreeFile(tree, row, col);

	event.cancelBubble = true;
	return false;
      }
    },

    context: {
      zipfileOpen: function(event) {
	var treeChild = ZipDown.getClickedTreeChildFromContextMenu();
	var zipItem = treeChild.parentNode.parentNode.parentNode;
	var path = treeChild.children[0].children[0].getAttribute("label");
	ZipDown.openFileFromZip(zipItem.getAttribute("file"), path);
      },

      zipfileShow: function(event) {
	var treeChild = ZipDown.getClickedTreeChildFromContextMenu();
	var zipItem = treeChild.parentNode.parentNode.parentNode;
	var path = treeChild.children[0].children[0].getAttribute("label");
	ZipDown.revealFileFromZip(zipItem.getAttribute("file"), path);
      }
    }
  },

  openTreeFile: function(tree, row, col){
    var filename = tree.view.getCellText(row.value, col.value);
    var zipname = tree.parentNode.getAttribute("file");

    ZipDown.openFileFromZip(zipname, filename);
  },

  toggleZipList: function(listItem) {
    var expanded = (listItem.getAttribute('expanded') == "true");

    // In some instances the parent item loses focus
    listItem.parentNode.focus();

    if(expanded) {
      listItem.setAttribute('expanded', "false");
    } else {
      // The first time the archive is expanded, create the contents tree
      ZipDown.createZipTree(listItem);

      listItem.setAttribute('expanded', "true");
    }
  },

  createZipTree: function(item) {
    if(item.getElementsByTagName('tree').length > 0) { return false; }

    var files = ZipDown.readEntriesFromZip(item.getAttribute('file'));

    var tree = document.getElementById("zipCollectionTemplate").children[0].cloneNode(true);
    tree.setAttribute("rows", files.length);
    var treeChildren = tree.getElementsByTagName("treechildren")[0];

    for(var i in files) {
      var fileItem = ZipDown.createZipItem(files[i]);
      treeChildren.appendChild(fileItem);
    }

    item.appendChild(tree);
  },

  // Create a dom node for an item in a zip archive
  createZipItem: function(file) {
    var fileItem = document.getElementById('zipItemTemplate').
                   getElementsByTagName('treeitem')[0].cloneNode(true);
    var fileCell = fileItem.getElementsByTagName('treecell')[0];
    fileCell.setAttribute('label', file);
    return fileItem;
  },

  // Update the download item in the download manager with the number of archived files
  updateExistingItem: function(item) {
    if(item.target.getAttribute('file').split('.')[item.target.getAttribute('file').split('.').length-1] == "zip") {
      var files = ZipDown.readEntriesFromZip(item.target.getAttribute('file'));
      item.target.setAttribute("zip", "true");
      item.target.setAttribute("itemCount", files.length + " items");
    }
  },

  readEntriesFromZip: function(path) {
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

    mZipReader.close();
    return files;
  },

  getFileFromZip: function(zipPath, filePath) {
    var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
    var zipFile = getLocalFileFromNativePathOrUrl(zipPath);

    var isDirectory = false;
    if(filePath.match(/\/$/)) {
      filePath = filePath.replace(/\/$/, '');
      isDirectory = true;
    }

    var f = Components.classes["@mozilla.org/file/directory_service;1"].
            getService(Components.interfaces.nsIProperties).
            get("TmpD", Components.interfaces.nsILocalFile);
    f.append(filePath.split('/')[filePath.split('/').length-1]);

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
      mZipReader.extract(filePath+"/", f);
    } else {
      mZipReader.extract(filePath, f);
    }
    mZipReader.close();

    return f;
  },

  revealFileFromZip: function(zipPath, filePath) {
    ZipDown.getFileFromZip(zipPath, filePath).reveal();
  },

  openFileFromZip: function(zipPath, filePath) {
    var f = ZipDown.getFileFromZip(zipPath, filePath);

    // Duplicated in downloads.js, unfortunately
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
      f.launch();
    } catch (ex) {
      // if launch fails, try sending it through the system's external
      // file: URL handler
      openExternal(f);
    }
  },

  fileDragObserver: {
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
	mZipReader.close();

	transferData.data = new TransferData();

	event.dataTransfer.mozSetDataAt("application/x-moz-file", f, 0);
      } catch(e) {
      }
    }
  },

  getClickedTreeChildFromContextMenu: function() {
    var row = document.popupNode._lastSelectedRow;
    var treeChildren = document.popupNode;
    return treeChildren.children[row];
  }
};

window.addEventListener("load", function(e) { ZipDown.init(); }, false);
