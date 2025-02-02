import list from "components/collapsableList";
import ScrollBar from "components/scrollbar";
import touchListeners from "ace/touchHandler";
import appSettings from "./settings";
import EditorView from "./editorView";
import EditorFile from "./editorFile";
import sidebarApps from "sidebarApps";
import quickTools from "components/quickTools";
import keyboardHandler from "handlers/keyboard";
import initColorView from "ace/colorView";
import { keydownState } from "handlers/keyboard";
import { deactivateColorView } from "ace/colorView";
import { scrollAnimationFrame } from "ace/touchHandler";
import { setCommands, setKeyBindings } from "ace/commands";
import {
  HARDKEYBOARDHIDDEN_NO,
  getSystemConfiguration
} from "./systemConfiguration";
import SideButton, { sideButtonContainer } from "components/sideButton";

//TODO: Add option to work multiple files at same time in large display.

let EDITOR_ID = 1;
let problemButton;

/**
 * @param {HTMLElement} $header
 * @param {HTMLElement} $body
 * @param {Booleab} $isMainEditor
 */
async function EditorManager($header, $body, $isMainEditor = false) {
  /**
   * @type {Collapsible & HTMLElement}
   */
  let activeFile;
  let $openFileList;
  let TIMEOUT_VALUE = 500;
  let preventScrollbarV = false;
  let preventScrollbarH = false;
  let scrollBarVisibilityCount = 0;
  let timeoutQuicktoolsToggler;
  let timeoutHeaderToggler;
  let destroyed = false;
  let isScrolling = false;
  let lastScrollTop = 0;
  let lastScrollLeft = 0;

  const { scrollbarSize } = appSettings.value;
  const events = {
    "switch-file": [],
    "rename-file": [],
    "save-file": [],
    "file-loaded": [],
    "file-content-changed": [],
    "add-folder": [],
    "remove-folder": [],
    update: [],
    "new-file": [],
    "remove-file": [],
    "int-open-file-list": [],
    emit(event, ...args) {
      if (!events[event]) return;
      events[event].forEach(fn => fn(...args));
    }
  };
  const $container = <div className="view-container"></div>;
  const editorContainer = <div className="editor-container"></div>;
  const editor = ace.edit(editorContainer);
  const $vScrollbar = ScrollBar({
    width: scrollbarSize,
    onscroll: onscrollV,
    onscrollend: onscrollVend,
    parent: editorContainer
  });
  const $hScrollbar = ScrollBar({
    width: scrollbarSize,
    onscroll: onscrollH,
    onscrollend: onscrollHEnd,
    parent: editorContainer,
    placement: "bottom"
  });
  const manager = {
    id: EDITOR_ID++,
    views: [],
    onupdate: () => {},
    editorContainer,

    addFile,
    editor,
    getFile,
    addView,
    getView,
    switchView,
    hasUnsavedFiles,
    getEditorHeight,
    getEditorWidth,
    header: $header,
    isMain: $isMainEditor,
    container: $container,

    switchTo: () => switchManager(),
    
    get isDestroyed() {
      return destroyed;
    },

    get activeFile() {
      if (activeFile) return activeFile;
      return (activeFile = new EditorFile(
        null, {render: false}, manager
      ));
    },
    set activeFile(value) {
      activeFile = value;
    },
    get files() {
      return manager.views.filter(view => view instanceof EditorFile);
    },
    set files(files) {
      const views = manager.views.filter(
        view =>
          view &&
          view instanceof EditorView &&
          view?.constructor.name === "EditorView"
      );
      manager.views = [...files, ...views];
    },
    get isScrolling() {
      return isScrolling;
    },
    get openFileList() {
      if (!$openFileList) initFileTabContainer();
      return $openFileList;
    },
    get TIMEOUT_VALUE() {
      return TIMEOUT_VALUE;
    },
    on(types, callback) {
      if (!Array.isArray(types)) types = [types];
      types.forEach(type => {
        if (!events[type]) events[type] = [];
        events[type].push(callback);
      });
    },
    off(types, callback) {
      if (!Array.isArray(types)) types = [types];
      types.forEach(type => {
        if (!events[type]) return;
        events[type] = events[type].filter(c => c !== callback);
      });
    },
    emit(event, ...args) {
      let detailedEvent;
      let detailedEventArgs = args.slice(1);
      if (event === "update") {
        const subEvent = args[0];
        if (subEvent) {
          detailedEvent = `${event}:${subEvent}`;
        }
      }
      events.emit(event, ...args);
      if (detailedEvent) {
        events.emit(detailedEvent, ...detailedEventArgs);
      }
    },
    destroy() {
      // console.log(manager, $isMainEditor);
      if ($isMainEditor) return;

      window.EDITOR_MANAGERS = EDITOR_MANAGERS.filter(
        item => item !== manager
      );

      manager.emit("destroy");
      EditorManager.emit("destroy", manager);

      editor.destroy();

      destroyed = true;

      $openFileList.remove();
      $container.remove();
      $body.remove();

      if (editorManager === manager) {
        window.EDITOR_MANAGERS[0].switchTo();
      }
    }
  };
  problemButton = SideButton({
    text: strings.problems,
    icon: "warningreport_problem",
    backgroundColor: "var(--danger-color)",
    textColor: "var(--danger-text-color)",
    onclick() {
      acode.exec("open", "problems");
    }
  });

  // set mode text
  editor.setSession(ace.createEditSession("", "ace/mode/text"));
  $body.append($container);
  await setupEditor();

  $hScrollbar.onshow = $vScrollbar.onshow = updateFloatingButton.bind(
    {},
    false
  );
  $hScrollbar.onhide = $vScrollbar.onhide = updateFloatingButton.bind({}, true);

  appSettings.on("update:textWrap", function (value) {
    updateMargin();
    for (let file of manager.files) {
      file.session.setUseWrapMode(value);
      if (!value) file.session.on("changeScrollLeft", onscrollleft);
      else file.session.off("changeScrollLeft", onscrollleft);
    }
  });

  appSettings.on("update:tabSize", function (value) {
    manager.files.forEach(file => file.session.setTabSize(value));
  });

  appSettings.on("update:softTab", function (value) {
    manager.files.forEach(file => file.session.setUseSoftTabs(value));
  });

  appSettings.on("update:showSpaces", function (value) {
    editor.setOption("showInvisibles", value);
  });

  appSettings.on("update:fontSize", function (value) {
    editor.setFontSize(value);
  });

  appSettings.on("update:openFileListPos", function (value) {
    initFileTabContainer();
    $vScrollbar.resize();
  });

  appSettings.on("update:showPrintMargin", function (value) {
    editorManager.editor.setOption("showPrintMargin", value);
  });

  appSettings.on("update:scrollbarSize", function (value) {
    $vScrollbar.size = value;
    $hScrollbar.size = value;
  });

  appSettings.on("update:liveAutoCompletion", function (value) {
    editor.setOption("enableLiveAutocompletion", value);
  });

  appSettings.on("update:linenumbers", function (value) {
    updateMargin(true);
    editor.resize(true);
  });

  appSettings.on("update:lineHeight", function (value) {
    editor.container.style.lineHeight = value;
  });

  appSettings.on("update:relativeLineNumbers", function (value) {
    editor.setOption("relativeLineNumbers", value);
  });

  appSettings.on("update:elasticTabstops", function (value) {
    editor.setOption("useElasticTabstops", value);
  });

  appSettings.on("update:rtlText", function (value) {
    editor.setOption("rtlText", value);
  });

  appSettings.on("update:hardWrap", function (value) {
    editor.setOption("hardWrap", value);
  });

  appSettings.on("update:printMargin", function (value) {
    editor.setOption("printMarginColumn", value);
  });

  appSettings.on("update:colorPreview", function (value) {
    if (value) {
      return initColorView(editor, true);
    }

    deactivateColorView();
  });

  appSettings.on("update:showSideButtons", function () {
    updateMargin();
  });

  appSettings.on("update:showAnnotations", function () {
    updateMargin(true);
  });

  EditorManager.emit("create", manager);
  return manager;

  /**
   *
   * @param {EditorFile} file
   */
  function addFile(file) {
    if (manager.files.includes(file)) return;
    manager.files.push(file);
    manager.openFileList.append(file.tab);
    file.editorManager = manager;
    $header.text = file.name;
  }

  function addView(view) {
    if (manager.views.includes(view)) return;
    manager.views.push(view);
    manager.openFileList.append(view.tab);
    view.editorManager = manager;
    $header.text = view.name;
  }

  function switchManager() {
    // Store previous editorManager in case of destroying current.
    if (manager.isDestroyed) return;

    if (editorManager !== manager) {
      window.editorManager = manager;
      EditorManager.emit("switch", manager);
    }
  }

  async function setupEditor() {
    const Emmet = ace.require("ace/ext/emmet");
    const textInput = editor.textInput.getElement();
    const settings = appSettings.value;
    const {
      leftMargin, textWrap,
      colorPreview, fontSize, lineHeight
    } = appSettings.value;
    const scrollMarginTop = 0;
    const scrollMarginLeft = 0;
    const scrollMarginRight = textWrap ? 0 : leftMargin;
    const scrollMarginBottom = 0;

    let checkTimeout = null;
    let autosaveTimeout;
    let scrollTimeout;

    editor.on("focus", async () => {
      switchManager();

      const { activeFile } = manager;
      activeFile.focused = true;
      keyboardHandler.on("keyboardShow", scrollCursorIntoView);

      if (isScrolling) return;

      $hScrollbar.hide();
      $vScrollbar.hide();
    });

    editor.on("blur", async () => {
      const { hardKeyboardHidden, keyboardHeight } =
        await getSystemConfiguration();
      const blur = () => {
        const { activeFile } = manager;
        activeFile.focused = false;
        activeFile.focusedBefore = false;
      };

      if (
        hardKeyboardHidden === HARDKEYBOARDHIDDEN_NO &&
        keyboardHeight < 100
      ) {
        // external keyboard
        blur();
        return;
      }

      const onKeyboardHide = () => {
        keyboardHandler.off("keyboardHide", onKeyboardHide);
        blur();
      };

      keyboardHandler.on("keyboardHide", onKeyboardHide);
    });

    editor.on("change", e => {
      if (checkTimeout) clearTimeout(checkTimeout);
      if (autosaveTimeout) clearTimeout(autosaveTimeout);

      checkTimeout = setTimeout(async () => {
        const { activeFile } = manager;

        if (activeFile.markChanged) {
          const changed = await activeFile.isChanged();
          activeFile.isUnsaved = changed;
          activeFile.writeToCache();
          events.emit("file-content-changed", activeFile);
          manager.onupdate("file-changed");
          manager.emit("update", "file-changed");

          const { autosave } = appSettings.value;
          if (activeFile.uri && changed && autosave) {
            autosaveTimeout = setTimeout(() => {
              acode.exec("save", false);
            }, autosave);
          }
        }
        activeFile.markChanged = true;
      }, TIMEOUT_VALUE);
    });

    editor.on("changeAnnotation", toggleProblemButton);

    editor.on("scroll", () => {
      clearTimeout(scrollTimeout);
      isScrolling = true;
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 100);
    });

    editor.renderer.on("resize", () => {
      $vScrollbar.resize($vScrollbar.visible);
      $hScrollbar.resize($hScrollbar.visible);
    });

    editor.on("scrolltop", onscrolltop);
    editor.on("scrollleft", onscrollleft);
    textInput.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        keydownState.esc = { value: true, target: textInput };
      }
    });

    if (colorPreview) {
      initColorView(editor);
    }

    touchListeners(editor);
    setCommands(editor);
    await setKeyBindings(editor);
    Emmet.setCore(window.emmet);
    editor.setFontSize(fontSize);
    editor.setHighlightSelectedWord(true);
    editor.container.style.lineHeight = lineHeight;

    ace.require("ace/ext/language_tools");
    editor.setOption("animatedScroll", false);
    editor.setOption("tooltipFollowsMouse", false);
    editor.setOption("theme", settings.editorTheme);
    editor.setOption(
      "showGutter",
      settings.linenumbers || settings.showAnnotations
    );
    editor.setOption("showLineNumbers", settings.linenumbers);
    editor.setOption("enableEmmet", true);
    editor.setOption("showInvisibles", settings.showSpaces);
    editor.setOption("indentedSoftWrap", false);
    editor.setOption("scrollPastEnd", 0.5);
    editor.setOption("showPrintMargin", settings.showPrintMargin);
    editor.setOption("relativeLineNumbers", settings.relativeLineNumbers);
    editor.setOption("useElasticTabstops", settings.elasticTabstops);
    editor.setOption("useTextareaForIME", settings.useTextareaForIME);
    editor.setOption("rtlText", settings.rtlText);
    editor.setOption("hardWrap", settings.hardWrap);
    editor.setOption("spellCheck", settings.spellCheck);
    editor.setOption("printMarginColumn", settings.printMargin);
    editor.setOption("enableBasicAutocompletion", true);
    editor.setOption("enableLiveAutocompletion", settings.liveAutoCompletion);
    // editor.setOption('enableInlineAutocompletion', settings.inlineAutoCompletion);

    updateMargin(true);
    editor.renderer.setScrollMargin(
      scrollMarginTop,
      scrollMarginBottom,
      scrollMarginLeft,
      scrollMarginRight
    );
  }

  function scrollCursorIntoView() {
    keyboardHandler.off("keyboardShow", scrollCursorIntoView);
    if (isCursorVisible()) return;
    const { teardropSize } = appSettings.value;
    editor.renderer.scrollCursorIntoView();
    editor.renderer.scrollBy(0, teardropSize + 10);
    editor._emit("scroll-intoview");
  }

  /**
   * Checks if the cursor is visible within the Ace editor.
   * @returns {boolean} - True if the cursor is visible, false otherwise.
   */
  function isCursorVisible() {
    const { editor, container } = editorManager;
    const { teardropSize } = appSettings.value;
    const cursorPos = editor.getCursorPosition();
    const contentTop = container.getBoundingClientRect().top;
    const contentBottom = contentTop + container.clientHeight;
    const cursorTop = editor.renderer.textToScreenCoordinates(
      cursorPos.row,
      cursorPos.column
    ).pageY;
    const cursorBottom = cursorTop + teardropSize + 10;
    return cursorTop >= contentTop && cursorBottom <= contentBottom;
  }

  /**
   * Callback function
   * @param {Number} value
   */
  function onscrollV(value) {
    preventScrollbarV = true;
    const session = editor.getSession();
    const editorHeight = getEditorHeight(editor);
    const scroll = editorHeight * value;

    session.setScrollTop(scroll);
    editor._emit("scroll", editor);
    cancelAnimationFrame(scrollAnimationFrame);
  }

  function onscrollVend() {
    preventScrollbarV = false;
  }

  /**
   * Callback function
   * @param {Number} value
   */
  function onscrollH(value) {
    preventScrollbarH = true;
    const session = editor.getSession();
    const editorWidth = getEditorWidth(editor);
    const scroll = editorWidth * value;

    session.setScrollLeft(scroll);
    editor._emit("scroll", editor);
    cancelAnimationFrame(scrollAnimationFrame);
  }

  function onscrollHEnd() {
    preventScrollbarH = false;
  }

  /**
   * Callback function called on scroll vertically
   */
  function setHScrollValue() {
    if (appSettings.value.textWrap || preventScrollbarH) return;
    const session = editor.getSession();
    const scrollLeft = session.getScrollLeft();

    if (scrollLeft === lastScrollLeft) return;

    const editorWidth = getEditorWidth(editor);
    const factor = (scrollLeft / editorWidth).toFixed(2);

    lastScrollLeft = scrollLeft;
    $hScrollbar.value = factor;
    editor._emit("scroll", "horizontal");
  }

  function onscrollleft() {
    setHScrollValue();
    $hScrollbar.render();
  }

  /**
   * Callback function called on scroll vertically
   */
  function setVScrollValue() {
    if (preventScrollbarV) return;
    const session = editor.getSession();
    const scrollTop = session.getScrollTop();

    if (scrollTop === lastScrollTop) return;

    const editorHeight = getEditorHeight(editor);
    const factor = (scrollTop / editorHeight).toFixed(2);

    lastScrollTop = scrollTop;
    $vScrollbar.value = factor;
    editor._emit("scroll", "vertical");
  }

  function onscrolltop() {
    setVScrollValue();
    $vScrollbar.render();
  }

  function updateFloatingButton(show = false) {
    const { $headerToggler } = acode;
    const { $toggler } = quickTools;

    if (show) {
      if (scrollBarVisibilityCount) --scrollBarVisibilityCount;

      if (!scrollBarVisibilityCount) {
        clearTimeout(timeoutHeaderToggler);
        clearTimeout(timeoutQuicktoolsToggler);

        if (appSettings.value.floatingButton) {
          $toggler.classList.remove("hide");
          root.appendOuter($toggler);
        }

        $headerToggler.classList.remove("hide");
        root.appendOuter($headerToggler);
      }
    } else {
      if (!scrollBarVisibilityCount) {
        if ($toggler.isConnected) {
          $toggler.classList.add("hide");
          timeoutQuicktoolsToggler = setTimeout(() => $toggler.remove(), 300);
        }
        if ($headerToggler.isConnected) {
          $headerToggler.classList.add("hide");
          timeoutHeaderToggler = setTimeout(() => $headerToggler.remove(), 300);
        }
      }

      ++scrollBarVisibilityCount;
    }
  }

  function toggleProblemButton() {
    const fileWithProblems = manager.files.find(file => {
      const annotations = file.session.getAnnotations();
      return !!annotations.length;
    });

    if (fileWithProblems) {
      problemButton.show();
    } else {
      problemButton.hide();
    }
  }

  function updateMargin(updateGutter = false) {
    const { showSideButtons, linenumbers, showAnnotations } = appSettings.value;
    const top = 0;
    const bottom = 0;
    const right = showSideButtons ? 15 : 0;
    const left = linenumbers ? (showAnnotations ? 0 : -16) : 0;

    editor.renderer.setMargin(top, bottom, left, right);

    if (!updateGutter) return;

    editor.setOptions({
      showGutter: linenumbers || showAnnotations,
      showLineNumbers: linenumbers
    });
  }

  function switchView(id) {
    const { activeFile } = manager;
    const { id: activeFileId } = activeFile;
    if (activeFileId === id) return;

    const file = manager.getView(id);
    const content = file.content;
    const activeContent = activeFile?.content;

    if (!content) throw new Error("View has no content");

    if (!activeContent) {
      manager.container.appendChild(content);
    } else if (activeContent && content !== activeContent) {
      activeContent.replaceWith(content);
    } else {
      manager.container.appendChild(content);
    }

    if (manager.container.children.length === 0) {
      manager.container.appendChild(content);
    }

    $hScrollbar.remove();
    $vScrollbar.remove();

    setVScrollValue();
    if (!appSettings.value.textWrap) {
      setHScrollValue();
    }

    manager.onupdate("switch-view");
    events.emit("switch-view", file);
  }

  function initFileTabContainer() {
    let $list;

    if ($openFileList) {
      if ($openFileList.classList.contains("collapsible")) {
        $list = Array.from($openFileList.$ul.children);
      } else {
        $list = Array.from($openFileList.children);
      }
      $openFileList.remove();
    }

    // show open file list in header
    const { openFileListPos } = appSettings.value;
    if (
      openFileListPos === appSettings.OPEN_FILE_LIST_POS_HEADER ||
      openFileListPos === appSettings.OPEN_FILE_LIST_POS_BOTTOM
    ) {
      if (!$openFileList?.classList.contains("open-file-list")) {
        $openFileList = <ul className="open-file-list"></ul>;
      }
      if ($list) $openFileList.append(...$list);

      if (openFileListPos === appSettings.OPEN_FILE_LIST_POS_BOTTOM) {
        $container.insertAdjacentElement("afterend", $openFileList);
      } else {
        $container.insertAdjacentElement("beforebegin", $openFileList);
      }

      root.classList.add("top-bar");

      const oldAppend = $openFileList.append;
      $openFileList.append = (...args) => {
        oldAppend.apply($openFileList, args);
      };
    } else {
      $openFileList = list(strings["active files"] + ` (${manager.id})`);
      $openFileList.classList.add("file-list");
      if ($list) $openFileList.$ul.append(...$list);
      $openFileList.expand();

      const oldAppend = $openFileList.$ul.append;
      $openFileList.append = (...args) => {
        oldAppend.apply($openFileList.$ul, args);
      };

      const files = sidebarApps.get("files");
      files.insertBefore($openFileList, files.firstElementChild);
      root.classList.remove("top-bar");
    }

    $openFileList.manager = manager;
    $openFileList.addEventListener(
      "click", () => switchManager()
    );

    root.setAttribute("open-file-list-pos", openFileListPos);
    manager.emit("int-open-file-list", openFileListPos);
  }

  function hasUnsavedFiles() {
    const unsavedFiles = manager.files.filter(file => file.isUnsaved);
    return unsavedFiles.length;
  }

  /**
   * Gets a file from the file manager
   * @param {string|number} checkFor
   * @param {"id"|"name"|"uri"} [type]
   * @returns {File}
   */
  function getFile(checkFor, type = "id") {
    return manager.files.find(file => {
      switch (type) {
        case "id":
          return file.id === checkFor;
        case "name":
          return file.name === checkFor;
        case "uri":
          return file.uri === checkFor;
        default:
          return false;
      }
    });
  }

  function getView(checkFor, type = "id") {
    return manager.views.find(file => {
      switch (type) {
        case "id":
          return file.id === checkFor;
        case "name":
          return file.name === checkFor;
        default:
          return false;
      }
    });
  }

  /**
   * Gets the height of the editor
   * @param {AceAjax.Editor} editor
   * @returns
   */
  function getEditorHeight(editor) {
    const { renderer, session } = editor;
    const offset = (renderer.$size.scrollerHeight + renderer.lineHeight) * 0.5;
    const editorHeight =
      session.getScreenLength() * renderer.lineHeight - offset;
    return editorHeight;
  }

  /**
   * Gets the height of the editor
   * @param {AceAjax.Editor} editor
   * @returns
   */
  function getEditorWidth(editor) {
    const { renderer, session } = editor;
    const offset = renderer.$size.scrollerWidth - renderer.characterWidth;
    const editorWidth =
      session.getScreenWidth() * renderer.characterWidth - offset;
    if (appSettings.value.textWrap) {
      return editorWidth;
    } else {
      return editorWidth + appSettings.value.leftMargin;
    }
  }
}

const events = {
  create: [],
  switch: [],
  destroy: [],

  emit(event, ...args) {
    if (!events[event]) return;
    events[event].forEach(fn => {
      try {
        fn(...args)
      } catch (err) {
        console.error(err, fn, ...args);
      }
    });
  }
};
EditorManager.on = (types, callback) => {
  if (!Array.isArray(types)) types = [types];
  types.forEach(type => {
    if (!events[type]) events[type] = [];
    events[type].push(callback);
  });
};

EditorManager.off = (types, callback) => {
  if (!Array.isArray(types)) types = [types];
  types.forEach(type => {
    if (!events[type]) return;
    events[type] = events[type].filter(c => c !== callback);
  });
};

EditorManager.emit = (event, ...args) => {
  let detailedEvent;
  if (event === "update") {
    const subEvent = args[0];
    if (subEvent) {
      detailedEvent = `${event}:${subEvent}`;
    }
  }
  events.emit(event, ...args);
  if (detailedEvent) {
    events.emit(detailedEvent, ...args.slice(1));
  }
};

export default EditorManager;
