const {
  addPluginToPluginManager,
  getCharacterRange,
  moveCaretTo,
  getCurrentLine,
} = require("../utils");
const {
  createCodeBlock,
  isCodeBlock,
  state,
  isInsideCodeBlock,
} = require("./utils");
const { addCodeBlockToolbar, refreshHighlighting } = require("./toolbar");

const TAB = `\u00A0\u00A0`;
const TAB_SEQUENCE = ["\u00A0", "\u0020"];
const TAB_LENGTH = 2;
const EMPTY_LINE = "<p><br></p>";

/**
 * @param {import("tinymce").Editor} editor
 */
function register(editor) {
  addCodeBlockToolbar(editor);

  editor.addCommand("mceInsertCodeBlock", function (api, args) {
    toggleCodeBlock(editor, api, args);
  });

  editor.ui.registry.addToggleButton("codeblock", {
    icon: "code-sample",
    tooltip: "Codeblock",
    onAction: function (api) {
      return toggleCodeBlock(editor, api);
    },
    onSetup: (api) => {
      return registerHandlers(api, editor);
    },
  });
}

var toggleCodeBlock = function (editor, api, type) {
  const node = editor.selection.getNode();
  const isInsideCodeBlock =
    (api && api.isActive && api.isActive()) || isInsideCodeBlock(node);
  if (isInsideCodeBlock) {
    const rng = editor.selection.getRng();
    const isTextSelected = rng.startOffset !== rng.endOffset;
    if (isTextSelected) {
      editor.undoManager.transact(() => {
        var content = editor.selection.getContent({ format: "text" });
        node.innerText = node.innerText.replace(content.trim(), "").trim();
        blurCodeBlock(editor, node, content.replace(/\n/gm, "<br>").trim());
        if (node.innerText.length <= 0) node.remove();
        else refreshHighlighting(editor);
      });
    } else {
      blurCodeBlock(editor, node);
    }
  } else {
    var content = editor.selection.getContent({ format: "text" }); //.replace(/^\n/gm, "");
    if (type === "shortcut") content = "<br>";
    if (!content) content = "<br>";
    insertCodeBlock(editor, content);
  }
};

function insertCodeBlock(editor, content) {
  editor.undoManager.transact(function () {
    const pre = createCodeBlock(content);
    editor.dom.setAttrib(pre, "data-mce-id", "__mcenew");
    editor.focus();
    editor.insertContent(`${pre.outerHTML}${EMPTY_LINE}`);

    setTimeout(() => {
      const insertedPre = editor.dom.select('*[data-mce-id="__mcenew"]')[0];
      editor.dom.setAttrib(insertedPre, "data-mce-id", null);
      editor.selection.select(insertedPre, true);
      editor.selection.collapse(true);
      editor.nodeChanged({ selectionChange: true });
    }, 0);
  });
}

function blurCodeBlock(editor, block, content = "<br>") {
  editor.undoManager.transact(function () {
    const p = document.createElement("p");
    p.innerHTML = content;
    editor.focus();
    editor.dom.insertAfter(p, block);

    setTimeout(() => {
      editor.selection.select(p, true);
      editor.selection.collapse(true);
      editor.nodeChanged({ selectionChange: true });
    }, 0);
  });
}

var isCreatingCodeBlock = false;
/**
 *
 * @param {*} api
 * @param {import("tinymce").Editor} editor
 * @returns
 */
var registerHandlers = function (api, editor) {
  function onNodeChanged(event) {
    const element = event.element;
    let isActive = isInsideCodeBlock(element);
    api.setActive(isActive);
  }

  // A simple hack to handle the ``` markdown text pattern
  // This acts as a "command" for us. Whenever, TinyMCE adds
  // <pre></pre> we override it and insert our own modified
  // code block.
  function onBeforeSetContent(e) {
    if (e.content === "<pre></pre>") {
      e.preventDefault();
      isCreatingCodeBlock = true;
      toggleCodeBlock(editor, undefined, "shortcut");
    }
  }

  function onBeforeExecCommand(e) {
    const node = editor.selection.getNode();

    // override pasting: by default the pasted code
    // is stripped of all newlines; i.e. it is pasted
    // as a single line.
    if (
      isCodeBlock(node) &&
      e.command === "mceInsertContent" &&
      e.value &&
      e.value.paste
    ) {
      e.value.content = e.value.content
        .replace(/<p>/gm, "")
        .replace(/<\/p>|<br \/>/gm, "\n");
    }

    // TextPattern plugin by default adds a new line for the replacement patterns,
    // but we don't want to add a new line so we override it.
    if (isCreatingCodeBlock && e.command === "mceInsertNewLine") {
      e.preventDefault();
      isCreatingCodeBlock = false;
    }
  }

  // TinyMCE doesn't handle tab key events by default.
  // This makes for a poor code block experience so
  // we have to handle all the logic manually.
  function onKeyDown(e) {
    const node = state.activeBlock;
    if (!node) return;

    if (e.code === "Tab") {
      e.preventDefault();
      handleTab(e, node);
    } else if (e.ctrlKey && e.code === "KeyA") {
      e.preventDefault();
      handleCtrlA(node);
    } else if (e.code === "Enter") {
      handleEnter(node);
    }
  }

  function handleEnter(node) {
    const currentLine = getCurrentLine(node);
    const indent =
      (currentLine.length - currentLine.trimStart().length) / TAB_LENGTH;
    editor.insertContent(TAB.repeat(indent));
  }

  function handleCtrlA(node) {
    editor.selection.select(node, true);
  }

  function handleTab(e, node) {
    const characterRange = getCharacterRange(node);
    if (!characterRange) return;

    // Shift + Tab = Deindent on all major platforms
    const isDeindent = e.shiftKey;
    const text = node.innerText;

    const isTextSelected = characterRange.start !== characterRange.end;
    if (isTextSelected) {
      // we need handle multiline tabbing as well
      // so we split the selected code into lines
      // and indent each line seperately.

      let [beforeSelection, selection, afterSelection] = [
        text.substring(0, characterRange.start),
        text.substring(characterRange.start, characterRange.end),
        text.substring(characterRange.end),
      ];
      let content = beforeSelection;
      const selectedLines = selection.split("\n");

      for (var i = 0; i < selectedLines.length; ++i) {
        const line = selectedLines[i];
        selectedLines[i] = isDeindent
          ? deindent(line, TAB_LENGTH)
          : `${TAB}${line}`;
      }
      content += selectedLines.join("\n");
      content += afterSelection;
      node.innerHTML = content;

      const endIndex = isDeindent
        ? characterRange.end - TAB_LENGTH * selectedLines.length
        : characterRange.end + TAB_LENGTH * selectedLines.length;

      moveCaretTo(node, characterRange.start, endIndex);
    } else {
      if (isDeindent) {
        const currentLine = getCurrentLine(node);
        node.innerHTML = node.innerText.replace(
          currentLine,
          deindent(currentLine, TAB_LENGTH)
        );
        moveCaretTo(node, characterRange.start - TAB_LENGTH);
      } else {
        editor.selection.setContent(TAB);
      }
    }
  }

  const onKeyUp = debounce((e) => {
    refreshHighlighting(editor);
  }, 500);

  editor.on("BeforeExecCommand", onBeforeExecCommand);
  editor.on("BeforeSetContent", onBeforeSetContent);
  editor.on("keydown", onKeyDown);
  editor.on("keyup", onKeyUp);
  editor.on("NodeChange", onNodeChanged);
  return function () {
    editor.off("BeforeExecCommand", onBeforeExecCommand);
    editor.off("BeforeSetContent", onBeforeSetContent);
    editor.off("keydown", onKeyDown);
    editor.off("keyup", onKeyUp);
    editor.off("NodeChange", onNodeChanged);
  };
};

function deindent(line, tabLength) {
  for (let i = 0; i < tabLength; ++i) {
    const char = line[i];
    if (!TAB_SEQUENCE.some((c) => c === char)) return line;
  }
  return line.substring(2);
}

(function init() {
  addPluginToPluginManager("codeblock", register);
})();

/**
 * Call this function in paste_postprocess function in tinymce.init.
 * This basically removes all internal formatting of code blocks and applies
 * the necessary formatting for consistency.
 */
function processPastedContent(node) {
  if (!node) return;

  if (node.childNodes) {
    for (let childNode of node.childNodes) {
      if (childNode.tagName === "PRE") {
        childNode.className = "hljs";
        const code = childNode.textContent || childNode.innerText;
        childNode.innerHTML = code;
      }
    }
  }
}

module.exports = { processPastedContent };

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
  var timeout;
  return function () {
    var context = this,
      args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}
