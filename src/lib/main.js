import "core-js/stable";
import "html-tag-js/dist/polyfill";

import "styles/main.scss";
import "styles/page.scss";
import "styles/list.scss";
import "styles/overrideAceStyle.scss";

import "lib/polyfill";
import "ace/supportedModes";
import "components/WebComponents";

import Url from "utils/Url";
import lang from "lib/lang";
import Acode from "lib/acode";
import themes from "theme/list";
import mustache from "mustache";
import startAd from "lib/startAd";
import tile from "components/tile";
import ajax from "@deadlyjack/ajax";
import helpers from "utils/helpers";
import settings from "lib/settings";
import $_menu from "views/menu.hbs";
import plugins from "pages/plugins";
import fsOperation from "fileSystem";
import toast from "components/toast";
import EditorFile from "lib/editorFile";
import EditorView from "lib/editorView";
import openFolder from "lib/openFolder";
import checkFiles from "lib/checkFiles";
import actionStack from "lib/actionStack";
import loadPolyFill from "utils/polyfill";
import loadPlugins from "lib/loadPlugins";
import tutorial from "components/tutorial";
import intentHandler from "handlers/intent";
import restoreFiles from "lib/restoreFiles";
import $_fileMenu from "views/file-menu.hbs";
import EditorManager from "lib/editorManager";
import applySettings from "lib/applySettings";
import keyboardHandler from "handlers/keyboard";
import Contextmenu from "components/contextmenu";
import otherSettings from "settings/appSettings";
import windowResize from "handlers/windowResize";
import quickToolsInit from "handlers/quickToolsInit";
import checkPluginsUpdate from "lib/checkPluginsUpdate";

import SideButton from "components/sideButton";
import Sidebar, { create as createSidebar } from "components/sidebar";

import { initModes } from "ace/modelist";
import { initFileList } from "lib/fileList";
import { addedFolder } from "lib/openFolder";
import { setKeyBindings } from "ace/commands";
import { keydownState } from "handlers/keyboard";
import { sideButtonContainer } from "components/sideButton";
import { getEncoding, initEncodings } from "utils/encodings";
import { sidebarApps, rightSidebarApps, loadApps } from "sidebarApps";

const previousVersionCode = parseInt(localStorage.versionCode, 10);

window.onload = Main;

async function Main() {
  const oldPreventDefault = TouchEvent.prototype.preventDefault;

  ajax.response = xhr => {
    return xhr.response;
  };

  loadPolyFill.apply(window);

  TouchEvent.prototype.preventDefault = function () {
    if (this.cancelable) {
      oldPreventDefault.bind(this)();
    }
  };

  window.addEventListener("resize", windowResize);
  document.addEventListener("pause", pauseHandler);
  document.addEventListener("resume", resumeHandler);
  document.addEventListener("keydown", keyboardHandler);
  document.addEventListener("deviceready", onDeviceReady);
  document.addEventListener("backbutton", backButtonHandler);
  document.addEventListener("menubutton", menuButtonHandler);
}

async function onDeviceReady() {
  try {
    await initEncodings(); // important to load encodings before anything else

    const isFreePackage = /(free)$/.test(BuildInfo.packageName);
    const oldResolveURL = window.resolveLocalFileSystemURL;
    const {
      externalCacheDirectory, //
      externalDataDirectory,
      cacheDirectory,
      dataDirectory
    } = cordova.file;

    window.app = document.body;
    window.root = tag.get("#root");
    window.addedFolder = addedFolder;
    window.editorManager = null;
    window.toast = toast;
    window.ASSETS_DIRECTORY = Url.join(
      cordova.file.applicationDirectory,
      "www"
    );
    window.DATA_STORAGE = externalDataDirectory || dataDirectory;
    window.CACHE_STORAGE = externalCacheDirectory || cacheDirectory;
    window.PLUGIN_DIR = Url.join(DATA_STORAGE, "plugins");
    window.KEYBINDING_FILE = Url.join(DATA_STORAGE, ".key-bindings.json");
    window.IS_FREE_VERSION = isFreePackage;

    startAd();

    try {
      await helpers.promisify(iap.startConnection).catch(e => {
        console.error("connection error:", e);
      });

      if (localStorage.acode_pro === "true") {
        window.IS_FREE_VERSION = false;
      }

      if (navigator.onLine) {
        const purchases = await helpers.promisify(iap.getPurchases);
        const isPro = purchases.find(p =>
          p.productIds.includes("acode_pro_new")
        );
        if (isPro) {
          window.IS_FREE_VERSION = false;
        } else {
          window.IS_FREE_VERSION = isFreePackage;
        }
      }
    } catch (error) {
      console.error("Purchase error:", error);
    }

    try {
      window.ANDROID_SDK_INT = await new Promise((resolve, reject) =>
        system.getAndroidVersion(resolve, reject)
      );
    } catch (error) {
      window.ANDROID_SDK_INT = parseInt(device.version);
    }
    window.DOES_SUPPORT_THEME = (() => {
      const $testEl = (
        <div
          style={{
            height: `var(--test-height)`,
            width: `var(--test-height)`
          }}
        ></div>
      );
      document.body.append($testEl);
      const client = $testEl.getBoundingClientRect();

      $testEl.remove();

      if (client.height === 0) return false;
      else return true;
    })();
    let acode = (window.acode = new Acode());
    window.EDITOR_MANAGERS = acode.editorManagers = new Array();

    system.requestPermission("com.termux.permission.RUN_COMMAND");
    system.requestPermission("android.permission.READ_EXTERNAL_STORAGE");
    system.requestPermission("android.permission.WRITE_EXTERNAL_STORAGE");
    system.requestPermission("android.permission.MANAGE_EXTERNAL_STORAGE");

    const { versionCode } = BuildInfo;

    if (previousVersionCode !== versionCode) {
      system.clearCache();
    }

    if (!(await fsOperation(PLUGIN_DIR).exists())) {
      await fsOperation(DATA_STORAGE).createDirectory("plugins");
    }

    localStorage.versionCode = versionCode;
    document.body.setAttribute(
      "data-version",
      `v${BuildInfo.version} (${versionCode})`
    );
    acode.setLoadingMessage("Loading settings...");

    window.resolveLocalFileSystemURL = function (url, ...args) {
      oldResolveURL.call(this, Url.safe(url), ...args);
    };

    setTimeout(() => {
      if (document.body.classList.contains("loading"))
        document.body.setAttribute(
          "data-small-msg",
          "This is taking unexpectedly long time!"
        );
    }, 1000 * 10);

    acode.setLoadingMessage("Loading settings...");
    await settings.init();
    themes.init();

    acode.setLoadingMessage("Loading language...");
    await lang.set(settings.value.lang);

    try {
      await loadApp(acode);
    } catch (error) {
      console.error(error);
      toast(`Error: ${error.message}`);
    } finally {
      setTimeout(() => {
        document.body.removeAttribute("data-small-msg");
        app.classList.remove("loading", "splash");
        applySettings.afterRender();
      }, 500);
    }
  } catch (err) {
    alert(String(err));
  }
}

async function loadApp(acode) {
  let $mainMenu;
  let $fileMenu;
  const $editMenuToggler = (
    <span
      className="icon edit"
      attr-action="toggle-edit-menu"
      style={{ fontSize: "1.2em" }}
    />
  );
  const $navToggler = (
    <span className="icon menu" attr-action="toggle-sidebar"></span>
  );
  const $menuToggler = (
    <span className="icon more_vert" attr-action="toggle-menu"></span>
  );
  const $header = tile({
    type: "header",
    text: "Acode",
    lead: $navToggler,
    tail: $menuToggler
  });
  const $main = <main></main>;
  const $sidebar = Sidebar({ container: $main, toggler: $navToggler });
  const $rightSidebar = createSidebar($main, undefined, "right");
  const $rightToggler = SideButton({
    icon: "menu",
    onclick: () => $rightSidebar.show()
  });
  rightSidebarApps.init($rightSidebar);
  $rightToggler.show();

  const $runBtn = (
    <span
      style={{ fontSize: "1.2em" }}
      className="icon play_arrow"
      attr-action="run"
      onclick={() => acode.exec("run")}
      oncontextmenu={() => acode.exec("run-file")}
    ></span>
  );
  const $splitBtn = (
    <span
      style={{ fontSize: "1.2em" }}
      className="icon add_circle"
      attr-action="new-editor"
      onclick={() => acode.exec("new-editor")}
      oncontextmenu={async () => {
        const { activeFile } = editorManager;
        const manager = await acode.exec("new-editor");
        editorManager.files.at(-1).makeActive();
        activeFile.editorManager = manager;
        activeFile.makeActive();
      }}
    ></span>
  );
  const $floatingNavToggler = (
    <span
      id="sidebar-toggler"
      className="floating icon menu"
      onclick={() => acode.exec("toggle-sidebar")}
    ></span>
  );
  const $headerToggler = (
    <span
      className="floating icon keyboard_arrow_left"
      id="header-toggler"
    ></span>
  );

  const folders = helpers.parseJSON(localStorage.folders);
  const files = helpers.parseJSON(localStorage.files) || [];
  $header.insertBefore($splitBtn, $header.lastChild);

  const editorManager = await EditorManager(
    $header,
    $main.appendChild(<div className="editor" id="main-editor"></div>),
    true
  );
  window.EDITOR_MANAGERS.push(editorManager);

  const setMainMenu = () => {
    if ($mainMenu) {
      $mainMenu.removeEventListener("click", handleMenu);
      $mainMenu.destroy();
    }
    const { openFileListPos, fullscreen } = settings.value;
    if (openFileListPos === settings.OPEN_FILE_LIST_POS_BOTTOM && fullscreen) {
      $mainMenu = createMainMenu({ bottom: "6px", toggler: $menuToggler });
    } else {
      $mainMenu = createMainMenu({ top: "6px", toggler: $menuToggler });
    }
    $mainMenu.addEventListener("click", handleMenu);
  };

  const setFileMenu = () => {
    if ($fileMenu) {
      $fileMenu.removeEventListener("click", handleMenu);
      $fileMenu.destroy();
    }
    const { openFileListPos, fullscreen } = settings.value;
    if (openFileListPos === settings.OPEN_FILE_LIST_POS_BOTTOM && fullscreen) {
      $fileMenu = createFileMenu({ bottom: "6px", toggler: $editMenuToggler });
    } else {
      $fileMenu = createFileMenu({ top: "6px", toggler: $editMenuToggler });
    }
    $fileMenu.addEventListener("click", handleMenu);
  };

  acode.$headerToggler = $headerToggler;
  window.actionStack = actionStack.windowCopy();

  acode.editorManager = editorManager;
  window.editorManager = editorManager;

  setMainMenu(settings.value.openFileListPos);
  setFileMenu(settings.value.openFileListPos);
  actionStack.onCloseApp = () => acode.exec("save-state");
  $headerToggler.onclick = function () {
    root.classList.toggle("show-header");
    this.classList.toggle("keyboard_arrow_left");
    this.classList.toggle("keyboard_arrow_right");
  };

  //#region rendering
  applySettings.beforeRender();
  root.appendOuter($header, $main, $floatingNavToggler, $headerToggler);
  //#endregion

  //#region Add event listeners
  initModes();
  quickToolsInit();
  updateSideButtonContainer();

  sidebarApps.init($sidebar);
  await loadApps();

  editorManager.onupdate = onEditorUpdate;

  root.on("show", mainPageOnShow);
  app.addEventListener("click", onClickApp);
  editorManager.on("rename-file", onFileUpdate);
  editorManager.on("switch-file", onFileUpdate);
  editorManager.on("file-loaded", onFileUpdate);
  navigator.app.overrideButton("menubutton", true);

  system.setIntentHandler(intentHandler, intentHandler.onError);
  system.getCordovaIntent(intentHandler, intentHandler.onError);

  setTimeout(showTutorials, 1000);

  settings.on("update:openFileListPos", () => {
    setMainMenu();
    setFileMenu();
  });
  settings.on("update:fullscreen", () => {
    setMainMenu();
    setFileMenu();
  });
  settings.on("update:showSideButtons", function () {
    updateSideButtonContainer();
  });

  function updateSideButtonContainer() {
    const { showSideButtons } = settings.value;
    if (!showSideButtons) {
      sideButtonContainer.remove();
      return;
    }

    $main.append(sideButtonContainer);
  }

  Sidebar.on("show", () => {
    const activeFile = editorManager.activeFile;
    if (activeFile) editorManager.editor.blur();
  });
  sdcard.watchFile(KEYBINDING_FILE, async () => {
    await setKeyBindings(editorManager.editor);
    toast(strings["key bindings updated"]);
  });
  //#endregion

  if (settings.value.hideWelcome) {
    new EditorFile();
  } else {
    const recentFiles = helpers
      .parseJSON(localStorage.recentFiles || "[]")
      .slice(0, 10);
    const recentFolders = helpers
      .parseJSON(localStorage.recentFolders || "[]")
      .slice(0, 10);
    const welcome = new EditorView("Welcome", {
      url: "acode://welcome",
      info: "Acode",
      content: (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "1rem",
              margin: "2rem",
              padding: "1rem"
            }}
          >
            <div style={{ padding: "1rem" }}>
              <h3 style={{ textAlign: "center" }}>Recent Folders</h3>
              <ul
                style={{
                  display: "flex",
                  marginTop: "1rem",
                  flexDirection: "column",
                  justifyContent: "start"
                }}
              >
                {recentFolders.map(folder => (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      textAlign: "center",
                      justifyContent: "start",
                      margin: ".5rem",
                      gap: ".5rem"
                    }}
                  >
                    <span className="icon folder"></span>
                    <span
                      className="text sub-text"
                      data-subtext={folder.url}
                      onclick={() => openFolder(folder.url, folder.opts)}
                    >
                      {Url.basename(folder.url)}
                    </span>
                  </div>
                ))}
              </ul>
            </div>
            <div style={{ padding: "1rem" }}>
              <h3 style={{ textAlign: "center" }}>Recent Files</h3>
              <ul
                style={{
                  display: "flex",
                  marginTop: "1rem",
                  flexDirection: "column",
                  justifyContent: "start"
                }}
              >
                {recentFiles.map(file => (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      textAlign: "center",
                      justifyContent: "start",
                      gap: ".5rem"
                    }}
                  >
                    <span className={helpers.getIconForFile(file)}></span>
                    <span
                      className="text sub-text"
                      data-subtext={file}
                      onclick={() => {
                        new EditorFile(Url.basename(file), { uri: file });
                      }}
                    >
                      {Url.basename(file)}
                    </span>
                  </div>
                ))}
              </ul>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: ".7rem",
              alignItems: "center"
            }}
          >
            <input
              type="checkbox"
              checked={!settings.value.hideWelcome}
              onchange={function () {
                settings.update({
                  hideWelcome: !this.checked
                });
              }}
            />
            <span class="text">Show welcome on startup</span>
          </div>
        </div>
      )
    });
    welcome.makeActive();
  }

  checkPluginsUpdate()
    .then(updates => {
      if (!updates.length) return;
      const $icon = (
        <span
          onclick={() => {
            plugins(updates);
            $icon.remove();
          }}
          attr-action=""
          style={{ fontSize: "1.2rem" }}
          className="icon notifications"
        ></span>
      );

      if ($editMenuToggler.isConnected) {
        $header.insertBefore($icon, $editMenuToggler);
      } else if ($runBtn.isConnected) {
        $header.insertBefore($icon, $runBtn);
      } else {
        $header.insertBefore($icon, $menuToggler);
      }
    })
    .catch(console.error);

  //load plugins
  try {
    acode.setLoadingMessage("Loading pty host");
    await acode.initialize();
  } catch (error) {
    console.error(error);
    toast("Error loading pty host!");
  }

  //load plugins
  try {
    await loadPlugins();
  } catch (error) {
    console.error(error);
    toast("Plugins loading failed!");
  }

  acode.setLoadingMessage("Loading folders...");
  if (Array.isArray(folders)) {
    folders.forEach(folder => {
      folder.opts.listFiles = !!folder.opts.listFiles;
      openFolder(folder.url, folder.opts);
    });
  }

  if (Array.isArray(files) && files.length) {
    try {
      await restoreFiles(files, () =>
        acode.exec("new-editor", [
          $header, $main.appendChild(
            <div className="editor"></div>
          )
        ])
      );
    } catch (error) {
      console.error(error);
      toast("File loading failed!");
    }
  } else {
    onEditorUpdate(undefined, false);
  }

  initFileList();

  /**
   *
   * @param {MouseEvent} e
   */
  function handleMenu(e) {
    const $target = e.target;
    const action = $target.getAttribute("action");
    const value = $target.getAttribute("value") || undefined;
    if (!action) return;

    if ($mainMenu.contains($target)) $mainMenu.hide();
    if ($fileMenu.contains($target)) $fileMenu.hide();
    acode.exec(action, value);
  }

  function onEditorUpdate(mode, saveState = true) {
    const { activeFile } = editorManager;

    if (!$editMenuToggler.isConnected) {
      $header.insertBefore($editMenuToggler, $header.lastChild);
    }

    if (mode === "switch-file") {
      if (settings.value.rememberFiles && activeFile) {
        localStorage.setItem("lastfile", activeFile.id);
      }
      return;
    }

    if (saveState) acode.exec("save-state");
  }

  async function onFileUpdate() {
    try {
      const { serverPort, previewPort } = settings.value;
      let canRun = false;
      if (serverPort !== previewPort) {
        canRun = true;
      } else {
        const { activeFile } = editorManager;
        canRun = await activeFile?.canRun();
      }

      if (canRun) {
        $header.insertBefore($runBtn, $header.lastChild);
      } else {
        $runBtn.remove();
      }
    } catch (error) {
      $runBtn.removeAttribute("run-file");
      $runBtn.remove();
    }
  }
}

function onClickApp(e) {
  let el = e.target;
  if (el instanceof HTMLAnchorElement || checkIfInsideAnchor()) {
    e.preventDefault();
    e.stopPropagation();

    system.openInBrowser(el.href);
  }

  function checkIfInsideAnchor() {
    const allAs = [...document.body.getAll("a")];

    for (let a of allAs) {
      if (a.contains(el)) {
        el = a;
        return true;
      }
    }

    return false;
  }
}

function mainPageOnShow() {
  const { editor } = editorManager;
  editor.resize(true);
}

function createMainMenu({ top, bottom, toggler }) {
  return Contextmenu({
    right: "6px",
    top,
    bottom,
    toggler,
    transformOrigin: top ? "top right" : "bottom right",
    innerHTML: () => {
      return mustache.render($_menu, strings);
    }
  });
}

function createFileMenu({ top, bottom, toggler }) {
  const $menu = Contextmenu({
    top,
    bottom,
    toggler,
    transformOrigin: top ? "top right" : "bottom right",
    innerHTML: () => {
      const file = editorManager.activeFile;

      if (file.loading) {
        $menu.classList.add("disabled");
      } else {
        $menu.classList.remove("disabled");
      }

      const { label: encoding } = getEncoding(file.encoding);

      return mustache.render($_fileMenu, {
        ...strings,
        file_mode: (file.session.getMode().$id || "").split("/").pop(),
        file_encoding: encoding,
        file_read_only: !file.editable,
        file_on_disk: !!file.uri,
        file_eol: file.eol,
        copy_text: !!editorManager.editor.getCopyText()
      });
    }
  });

  return $menu;
}

function showTutorials() {
  if (window.innerWidth > 750) {
    tutorial("quicktools-tutorials", hide => {
      const onclick = () => {
        otherSettings();
        hide();
      };

      return (
        <p>
          Quicktools has been <strong>disabled</strong> because it seems like
          you are on a bigger screen and probably using a keyboard. To enable
          it,{" "}
          <span className="link" onclick={onclick}>
            click here
          </span>{" "}
          or press <kbd>Ctrl + Shift + P</kbd> and search for{" "}
          <code>quicktools</code>.
        </p>
      );
    });
  }
}

function backButtonHandler() {
  if (keydownState.esc) {
    keydownState.esc = false;
    return;
  }
  actionStack.pop();
}

function menuButtonHandler() {
  const { acode } = window;
  acode?.exec("toggle-sidebar");
}

function pauseHandler() {
  const { acode } = window;
  acode?.exec("save-state");
}

function resumeHandler() {
  if (!settings.value.checkFiles) return;
  checkFiles();
}
