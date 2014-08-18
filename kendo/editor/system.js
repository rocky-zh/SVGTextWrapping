(function(f, define){
    define([ "./range" ], f);
})(function(){

(function($) {

    // Imports ================================================================
    var kendo = window.kendo,
        Class = kendo.Class,
        editorNS = kendo.ui.editor,
        EditorUtils = editorNS.EditorUtils,
        registerTool = EditorUtils.registerTool,
        dom = editorNS.Dom,
        Tool = editorNS.Tool,
        ToolTemplate = editorNS.ToolTemplate,
        RestorePoint = editorNS.RestorePoint,
        Marker = editorNS.Marker,
        extend = $.extend;

var Command = Class.extend({
    init: function(options) {
        this.options = options;
        this.restorePoint = new RestorePoint(options.range);
        this.marker = new Marker();
        this.formatter = options.formatter;
    },

    getRange: function () {
        return this.restorePoint.toRange();
    },

    lockRange: function (expand) {
        return this.marker.add(this.getRange(), expand);
    },

    releaseRange: function (range) {
        this.marker.remove(range);
        this.editor.selectRange(range);
    },

    undo: function () {
        var point = this.restorePoint;
        point.restoreHtml();
        this.editor.selectRange(point.toRange());
    },

    redo: function () {
        this.exec();
    },

    createDialog: function (content, options) {
        var editor = this.editor;

        return $(content).appendTo(document.body)
            .kendoWindow(extend({}, editor.options.dialogOptions, options))
            .closest(".k-window").toggleClass("k-rtl", kendo.support.isRtl(editor.wrapper)).end();
    },

    exec: function () {
        var range = this.lockRange(true);
        this.formatter.editor = this.editor;
        this.formatter.toggle(range);
        this.releaseRange(range);
    }
});

var GenericCommand = Class.extend({
    init: function(startRestorePoint, endRestorePoint) {
        this.body = startRestorePoint.body;
        this.startRestorePoint = startRestorePoint;
        this.endRestorePoint = endRestorePoint;
    },

    redo: function () {
        this.body.innerHTML = this.endRestorePoint.html;
        this.editor.selectRange(this.endRestorePoint.toRange());
    },

    undo: function () {
        this.body.innerHTML = this.startRestorePoint.html;
        this.editor.selectRange(this.startRestorePoint.toRange());
    }
});

var InsertHtmlCommand = Command.extend({
    init: function(options) {
        Command.fn.init.call(this, options);

        this.managesUndoRedo = true;
    },

    exec: function() {
        var editor = this.editor;
        var options = this.options;
        var range = options.range;
        var body = editor.body;
        var startRestorePoint = new RestorePoint(range, body);
        var html = options.html || options.value || '';

        editor.selectRange(range);

        editor.clipboard.paste(html, options);

        if (options.postProcess) {
            options.postProcess(editor, editor.getRange());
        }

        var genericCommand = new GenericCommand(startRestorePoint, new RestorePoint(editor.getRange(), body));
        genericCommand.editor = editor;
        editor.undoRedoStack.push(genericCommand);

        editor.focus();
    }
});

var InsertHtmlTool = Tool.extend({
    initialize: function(ui, initOptions) {
        var editor = initOptions.editor,
            options = this.options,
            dataSource = options.items ? options.items : editor.options.insertHtml;

        new editorNS.SelectBox(ui, {
            dataSource: dataSource,
            dataTextField: "text",
            dataValueField: "value",
            change: function () {
                Tool.exec(editor, 'insertHtml', this.value());
            },
            title: editor.options.messages.insertHtml,
            highlightFirst: false
        });
    },

    command: function (commandArguments) {
        return new InsertHtmlCommand(commandArguments);
    },

    update: function(ui) {
        var selectbox = ui.data("kendoSelectBox") || ui.find("select").data("kendoSelectBox");
        selectbox.close();
        selectbox.value(selectbox.options.title);
    }
});

var UndoRedoStack = Class.extend({
    init: function() {
        this.stack = [];
        this.currentCommandIndex = -1;
    },

    push: function (command) {
        this.stack = this.stack.slice(0, this.currentCommandIndex + 1);
        this.currentCommandIndex = this.stack.push(command) - 1;
    },

    undo: function () {
        if (this.canUndo()) {
            this.stack[this.currentCommandIndex--].undo();
        }
    },

    redo: function () {
        if (this.canRedo()) {
            this.stack[++this.currentCommandIndex].redo();
        }
    },

    canUndo: function () {
        return this.currentCommandIndex >= 0;
    },

    canRedo: function () {
        return this.currentCommandIndex != this.stack.length - 1;
    }
});

var TypingHandler = Class.extend({
    init: function(editor) {
        this.editor = editor;
    },

    keydown: function (e) {
        var that = this,
            editor = that.editor,
            keyboard = editor.keyboard,
            isTypingKey = keyboard.isTypingKey(e),
            evt = extend($.Event(), e);

        that.editor.trigger("keydown", evt);

        if (evt.isDefaultPrevented()) {
            e.preventDefault();
        }

        if (!evt.isDefaultPrevented() && isTypingKey && !keyboard.isTypingInProgress()) {
            var range = editor.getRange();
            that.startRestorePoint = new RestorePoint(range);

            keyboard.startTyping(function () {
                editor.selectionRestorePoint = that.endRestorePoint = new RestorePoint(editor.getRange());
                var genericCommand = new GenericCommand(that.startRestorePoint, that.endRestorePoint);
                genericCommand.editor = editor;

                editor.undoRedoStack.push(genericCommand);
            });

            return true;
        }

        return false;
    },

    keyup: function (e) {
        var keyboard = this.editor.keyboard;

        this.editor.trigger("keyup", e);

        if (keyboard.isTypingInProgress()) {
            keyboard.endTyping();
            return true;
        }

        return false;
    }
});

var SystemHandler = Class.extend({
    init: function(editor) {
        this.editor = editor;
        this.systemCommandIsInProgress = false;
    },

    createUndoCommand: function () {
        var that = this;

        that.endRestorePoint = new RestorePoint(that.editor.getRange());
        var command = new GenericCommand(that.startRestorePoint, that.endRestorePoint);
        command.editor = that.editor;
        that.editor.undoRedoStack.push(command);
        that.startRestorePoint = that.endRestorePoint;
    },

    changed: function () {
        if (this.startRestorePoint) {
            return this.startRestorePoint.html != this.editor.body.innerHTML;
        }

        return false;
    },

    keydown: function (e) {
        var that = this,
            editor = that.editor,
            keyboard = editor.keyboard;

        if (keyboard.isModifierKey(e)) {

            if (keyboard.isTypingInProgress()) {
                keyboard.endTyping(true);
            }

            that.startRestorePoint = new RestorePoint(editor.getRange());
            return true;
        }

        if (keyboard.isSystem(e)) {
            that.systemCommandIsInProgress = true;

            if (that.changed()) {
                that.systemCommandIsInProgress = false;
                that.createUndoCommand();
            }

            return true;
        }

        return false;
    },

    keyup: function (e) {
        var that = this;

        if (that.systemCommandIsInProgress && that.changed()) {
            that.systemCommandIsInProgress = false;
            that.createUndoCommand(e);
            return true;
        }

        return false;
    }
});

var Keyboard = Class.extend({
    init: function(handlers) {
        this.handlers = handlers;
        this.typingInProgress = false;
    },

    isCharacter: function(keyCode) {
        return (keyCode >= 48 && keyCode <= 90) || (keyCode >= 96 && keyCode <= 111) ||
               (keyCode >= 186 && keyCode <= 192) || (keyCode >= 219 && keyCode <= 222) ||
               keyCode == 229;
    },

    toolFromShortcut: function (tools, e) {
        var key = String.fromCharCode(e.keyCode),
            toolName,
            toolOptions;

        for (toolName in tools) {
            toolOptions = $.extend({ ctrl: false, alt: false, shift: false }, tools[toolName].options);

            if ((toolOptions.key == key || toolOptions.key == e.keyCode) &&
                toolOptions.ctrl == e.ctrlKey &&
                toolOptions.alt == e.altKey &&
                toolOptions.shift == e.shiftKey) {
                return toolName;
            }
        }
    },

    isTypingKey: function (e) {
        var keyCode = e.keyCode;
        return (this.isCharacter(keyCode) && !e.ctrlKey && !e.altKey) ||
               keyCode == 32 || keyCode == 13 || keyCode == 8 ||
               (keyCode == 46 && !e.shiftKey && !e.ctrlKey && !e.altKey);
    },

    isModifierKey: function (e) {
        var keyCode = e.keyCode;
        return (keyCode == 17 && !e.shiftKey && !e.altKey) ||
               (keyCode == 16 && !e.ctrlKey && !e.altKey) ||
               (keyCode == 18 && !e.ctrlKey && !e.shiftKey);
    },

    isSystem: function (e) {
        return e.keyCode == 46 && e.ctrlKey && !e.altKey && !e.shiftKey;
    },

    startTyping: function (callback) {
        this.onEndTyping = callback;
        this.typingInProgress = true;
    },

    stopTyping: function() {
        this.typingInProgress = false;
        if (this.onEndTyping) {
            this.onEndTyping();
        }
    },

    endTyping: function (force) {
        var that = this;
        that.clearTimeout();
        if (force) {
            that.stopTyping();
        } else {
            that.timeout = window.setTimeout($.proxy(that.stopTyping, that), 1000);
        }
    },

    isTypingInProgress: function () {
        return this.typingInProgress;
    },

    clearTimeout: function () {
        window.clearTimeout(this.timeout);
    },

    notify: function(e, what) {
        var i, handlers = this.handlers;

        for (i = 0; i < handlers.length; i++) {
            if (handlers[i][what](e)) {
                break;
            }
        }
    },

    keydown: function (e) {
        this.notify(e, 'keydown');
    },

    keyup: function (e) {
        this.notify(e, 'keyup');
    }
});

var Clipboard = Class.extend({
    init: function(editor) {
        this.editor = editor;
        this.cleaners = [
            new ScriptCleaner(),
            new MSWordFormatCleaner(),
            new WebkitFormatCleaner()
        ];
    },

    htmlToFragment: function(html) {
        var editor = this.editor,
            doc = editor.document,
            container = dom.create(doc, 'div'),
            fragment = doc.createDocumentFragment();

        container.innerHTML = html;

        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }

        return fragment;
    },

    isBlock: function(html) {
        return (/<(div|p|ul|ol|table|h[1-6])/i).test(html);
    },

    _contentModification: function(before, after) {
        var that = this;
        var editor = that.editor;
        var range;
        var startRestorePoint;

        if (that._inProgress) {
            return;
        }

        that._inProgress = true;

        range = editor.getRange();
        startRestorePoint = new RestorePoint(range);

        dom.persistScrollTop(editor.document);

        before.call(that, editor, range);

        setTimeout(function() {
            after.call(that, editor, range);

            var endRestorePoint = new RestorePoint(editor.getRange());
            var genericCommand = new GenericCommand(startRestorePoint, endRestorePoint);
            genericCommand.editor = editor;
            editor.undoRedoStack.push(genericCommand);
            editor._selectionChange();

            that._inProgress = false;
        });
    },

    oncut: function() {
        this._contentModification($.noop, $.noop);
    },

    onpaste: function(e) {
        this._contentModification(
            function beforePaste(editor, range) {
                var clipboardNode = dom.create(editor.document, 'div', {
                        className:'k-paste-container',
                        innerHTML: "\ufeff"
                    });

                editor.body.appendChild(clipboardNode);

                if (editor.body.createTextRange) {
                    e.preventDefault();
                    var r = editor.createRange();
                    r.selectNodeContents(clipboardNode);
                    editor.selectRange(r);
                    var textRange = editor.body.createTextRange();
                    textRange.moveToElementText(clipboardNode);
                    $(editor.body).unbind('paste');
                    textRange.execCommand('Paste');
                    $(editor.body).bind('paste', $.proxy(this.onpaste, this));
                } else {
                    var clipboardRange = editor.createRange();
                    clipboardRange.selectNodeContents(clipboardNode);
                    editor.selectRange(clipboardRange);
                }

                range.deleteContents();
            },
            function afterPaste(editor, range) {
                var html = "", args = { html: "" }, containers;
                var browser = kendo.support.browser;

                editor.selectRange(range);

                containers = $(editor.body).children(".k-paste-container");

                containers.each(function() {
                    var lastChild = this.lastChild;

                    if (lastChild && dom.is(lastChild, 'br')) {
                        dom.remove(lastChild);
                    }

                    html += this.innerHTML;
                });

                containers.remove();

                html = html.replace(/\ufeff/g, "");

                args.html = html;

                editor.trigger("paste", args);
                editor.clipboard.paste(args.html, { clean: true });
            }
        );
    },

    splittableParent: function(block, node) {
        var parentNode, body;

        if (block) {
            return dom.closestEditableOfType(node, ['p', 'ul', 'ol']) || node.parentNode;
        }

        parentNode = node.parentNode;
        body = node.ownerDocument.body;

        if (dom.isInline(parentNode)) {
            while (parentNode.parentNode != body && !dom.isBlock(parentNode.parentNode)) {
                parentNode = parentNode.parentNode;
            }
        }

        return parentNode;
    },

    paste: function (html, options) {
        var editor = this.editor,
            i, l;

        options = extend({ clean: false, split: true }, options);

        for (i = 0, l = this.cleaners.length; i < l; i++) {
            if (this.cleaners[i].applicable(html)) {
                html = this.cleaners[i].clean(html);
            }
        }

        if (options.clean) {
            // remove br elements which immediately precede block elements
            html = html.replace(/(<br>(\s|&nbsp;)*)+(<\/?(div|p|li|col|t))/ig, "$3");
            // remove empty inline elements
            html = html.replace(/<(a|span)[^>]*><\/\1>/ig, "");
        }

        // It is possible in IE to copy just <li> tags
        html = html.replace(/^<li/i, '<ul><li').replace(/li>$/g, 'li></ul>');

        var block = this.isBlock(html);

        editor.focus();
        var range = editor.getRange();
        range.deleteContents();

        if (range.startContainer == editor.document) {
            range.selectNodeContents(editor.body);
        }

        var marker = new Marker();
        var caret = marker.addCaret(range);

        var parent = this.splittableParent(block, caret);
        var unwrap = false;
        var splittable = parent != editor.body && !dom.is(parent, "td");

        if (options.split && splittable && (block || dom.isInline(parent))) {
            range.selectNode(caret);
            editorNS.RangeUtils.split(range, parent, true);
            unwrap = true;
        }

        var fragment = this.htmlToFragment(html);

        if (fragment.firstChild && fragment.firstChild.className === "k-paste-container") {
            var fragmentsHtml = [];
            for (i = 0, l = fragment.childNodes.length; i < l; i++) {
                fragmentsHtml.push(fragment.childNodes[i].innerHTML);
            }

            fragment = this.htmlToFragment(fragmentsHtml.join('<br />'));
        }

        $(fragment.childNodes)
            .filter("table").addClass("k-table").end()
            .find("table").addClass("k-table");

        range.insertNode(fragment);

        parent = this.splittableParent(block, caret);
        if (unwrap) {
            while (caret.parentNode != parent) {
                dom.unwrap(caret.parentNode);
            }

            dom.unwrap(caret.parentNode);
        }

        dom.normalize(range.commonAncestorContainer);
        caret.style.display = 'inline';
        dom.restoreScrollTop(editor.document);
        dom.scrollTo(caret);
        marker.removeCaret(range);
        editor.selectRange(range);
    }
});

var Cleaner = Class.extend({
    clean: function(html) {
        var that = this,
            replacements = that.replacements,
            i, l;

        for (i = 0, l = replacements.length; i < l; i += 2) {
            html = html.replace(replacements[i], replacements[i+1]);
        }

        return html;
    }
});

var ScriptCleaner = Cleaner.extend({
    init: function() {
        this.replacements = [
            /<(\/?)script([^>]*)>/i, "<$1telerik:script$2>"
        ];
    },

    applicable: function(html) {
        return (/<script[^>]*>/i).test(html);
    }
});

var MSWordFormatCleaner = Cleaner.extend({
    init: function() {
        this.replacements = [
            /<\?xml[^>]*>/gi, '',
            /<!--(.|\n)*?-->/g, '', /* comments */
            /&quot;/g, "'", /* encoded quotes (in attributes) */
            /(?:<br>&nbsp;[\s\r\n]+|<br>)*(<\/?(h[1-6]|hr|p|div|table|tbody|thead|tfoot|th|tr|td|li|ol|ul|caption|address|pre|form|blockquote|dl|dt|dd|dir|fieldset)[^>]*>)(?:<br>&nbsp;[\s\r\n]+|<br>)*/g, '$1',
            /<br><br>/g, '<BR><BR>',
            /<br>(?!\n)/g, ' ',
            /<table([^>]*)>(\s|&nbsp;)+<t/gi, '<table$1><t',
            /<tr[^>]*>(\s|&nbsp;)*<\/tr>/gi, '',
            /<tbody[^>]*>(\s|&nbsp;)*<\/tbody>/gi, '',
            /<table[^>]*>(\s|&nbsp;)*<\/table>/gi, '',
            /<BR><BR>/g, '<br>',
            /^\s*(&nbsp;)+/gi, '',
            /(&nbsp;|<br[^>]*>)+\s*$/gi, '',
            /mso-[^;"]*;?/ig, '', /* office-related CSS attributes */
            /<(\/?)b(\s[^>]*)?>/ig, '<$1strong$2>',
            /<(\/?)i(\s[^>]*)?>/ig, '<$1em$2>',
            /<o:p>&nbsp;<\/o:p>/ig, '&nbsp;',
            /<\/?(meta|link|style|o:|v:|x:)[^>]*>((?:.|\n)*?<\/(meta|link|style|o:|v:|x:)[^>]*>)?/ig, '', /* external references and namespaced tags */
            /<\/o>/g, '',
            /style=(["|'])\s*\1/g, '', /* empty style attributes */
            /(<br[^>]*>)?\n/g, function ($0, $1) { return $1 ? $0 : ' '; } /* phantom extra line feeds */
        ];
    },

    applicable: function(html) {
        return (/class="?Mso|style="[^"]*mso-/i).test(html) || (/urn:schemas-microsoft-com:office/).test(html);
    },

    stripEmptyAnchors: function(html) {
        return html.replace(/<a([^>]*)>\s*<\/a>/ig, function(a, attributes) {
            if (!attributes || attributes.indexOf("href") < 0) {
                return "";
            }

            return a;
        });
    },

    listType: function(html) {
        var startingSymbol;

        if (/^(<span [^>]*texhtml[^>]*>)?<span [^>]*(Symbol|Wingdings)[^>]*>/i.test(html)) {
            startingSymbol = true;
        }

        html = html.replace(/<\/?\w+[^>]*>/g, '').replace(/&nbsp;/g, '\u00a0');

        if ((!startingSymbol && /^[\u2022\u00b7\u00a7\u00d8o]\u00a0+/.test(html)) ||
            (startingSymbol && /^.\u00a0+/.test(html))) {
            return 'ul';
        }

        if (/^\s*\w+[\.\)]\u00a0{2,}/.test(html)) {
            return 'ol';
        }
    },

    lists: function(placeholder) {
        var blockChildren = $(dom.blockElements.join(','), placeholder),
            lastMargin = -1,
            lastType,
            name,
            levels = {'ul':{}, 'ol':{}},
            li = placeholder,
            i, p, type, margin, list, key, child;

        for (i = 0; i < blockChildren.length; i++) {
            p = blockChildren[i];
            type = this.listType(p.innerHTML);
            name = dom.name(p);

            if (name == "td") {
                continue;
            }

            if (!type || name != 'p') {
                if (!p.innerHTML) {
                    dom.remove(p);
                } else {
                    levels = {'ul':{}, 'ol':{}};
                    li = placeholder;
                    lastMargin = -1;
                }
                continue;
            }

            margin = parseFloat(p.style.marginLeft || 0);
            list = levels[type][margin];

            if (margin > lastMargin || !list) {
                list = dom.create(document, type);

                if (li == placeholder) {
                    dom.insertBefore(list, p);
                } else {
                    li.appendChild(list);
                }

                levels[type][margin] = list;
            }

            if (lastType != type) {
                for (key in levels) {
                    for (child in levels[key]) {
                        if ($.contains(list, levels[key][child])) {
                            delete levels[key][child];
                        }
                    }
                }
            }

            dom.remove(p.firstChild);
            li = dom.create(document, 'li', {innerHTML:p.innerHTML});
            list.appendChild(li);
            dom.remove(p);
            lastMargin = margin;
            lastType = type;
        }
    },

    removeAttributes: function(element) {
        var attributes = element.attributes,
            i = attributes.length;

        while (i--) {
            if (dom.name(attributes[i]) != "colspan") {
                element.removeAttributeNode(attributes[i]);
            }
        }
    },

    createColGroup: function(row) {
        var cells = row.cells;
        var table = $(row).closest("table");
        var colgroup = table.children("colgroup");

        if (cells.length < 2) {
            return;
        } else if (colgroup.length) {
            cells = colgroup.children();
            colgroup[0].parentNode.removeChild(colgroup[0]);
        }

        colgroup = $($.map(cells, function(cell) {
                var width = cell.width;
                if (width && parseInt(width, 10) !== 0) {
                    return kendo.format('<col style="width:{0}px;"/>', width);
                }

                return "<col />";
            }).join(""));

        // jquery 1.9/2.0 discrepancy
        if (!colgroup.is("colgroup")) {
            colgroup = $("<colgroup/>").append(colgroup);
        }

        colgroup.prependTo(table);
    },

    convertHeaders: function(row) {
        var cells = row.cells,
            i,
            boldedCells = $.map(cells, function(cell) {
                var child = $(cell).children("p").children("strong")[0];

                if (child && dom.name(child) == "strong") {
                    return child;
                }
            });

        if (boldedCells.length == cells.length) {
            for (i = 0; i < boldedCells.length; i++) {
                dom.unwrap(boldedCells[i]);
            }

            $(row).closest("table")
                .find("colgroup").after("<thead></thead>").end()
                .find("thead").append(row);

            for (i = 0; i < cells.length; i++) {
                dom.changeTag(cells[i], "th");
            }
        }
    },

    removeParagraphs: function(cells) {
        var i, j, len, cell, paragraphs;

        for (i = 0; i < cells.length; i++) {
            this.removeAttributes(cells[i]);

            // remove paragraphs and insert line breaks between them
            cell = $(cells[i]);
            paragraphs = cell.children("p");

            for (j = 0, len = paragraphs.length; j < len; j++) {
                if (j < len - 1) {
                    dom.insertAfter(dom.create(document, "br"), paragraphs[j]);
                }

                dom.unwrap(paragraphs[j]);
            }
        }
    },

    removeDefaultColors: function(spans) {
        for (var i = 0; i < spans.length; i++) {
            if (/^\s*color:\s*[^;]*;?$/i.test(spans[i].style.cssText)) {
                dom.unwrap(spans[i]);
            }
        }
    },

    tables: function(placeholder) {
        var tables = $(placeholder).find("table"),
            that = this,
            rows,
            firstRow, longestRow, i, j;

        for (i = 0; i < tables.length; i++) {
            rows = tables[i].rows;
            longestRow = firstRow = rows[0];

            for (j = 1; j < rows.length; j++) {
                if (rows[j].cells.length > longestRow.cells.length) {
                    longestRow = rows[j];
                }
            }

            that.createColGroup(longestRow);
            that.convertHeaders(firstRow);

            that.removeAttributes(tables[i]);

            that.removeParagraphs(tables.eq(i).find("td,th"));
            that.removeDefaultColors(tables.eq(i).find("span"));
        }
    },

    clean: function(html) {
        var that = this, placeholder;

        html = Cleaner.fn.clean.call(that, html);
        html = that.stripEmptyAnchors(html);

        placeholder = dom.create(document, 'div', {innerHTML: html});
        that.lists(placeholder);
        that.tables(placeholder);

        html = placeholder.innerHTML.replace(/(<[^>]*)\s+class="?[^"\s>]*"?/ig, '$1');

        return html;
    }
});

var WebkitFormatCleaner = Cleaner.extend({
    init: function() {
        this.replacements = [
            /\s+class="Apple-style-span[^"]*"/gi, '',
            /<(div|p|h[1-6])\s+style="[^"]*"/gi, '<$1',
            /^<div>(.*)<\/div>$/, '$1'
        ];
    },

    applicable: function(html) {
        return (/class="?Apple-style-span|style="[^"]*-webkit-nbsp-mode/i).test(html);
    }
});

extend(editorNS, {
    Command: Command,
    GenericCommand: GenericCommand,
    InsertHtmlCommand: InsertHtmlCommand,
    InsertHtmlTool: InsertHtmlTool,
    UndoRedoStack: UndoRedoStack,
    TypingHandler: TypingHandler,
    SystemHandler: SystemHandler,
    Keyboard: Keyboard,
    Clipboard: Clipboard,
    Cleaner: Cleaner,
    MSWordFormatCleaner: MSWordFormatCleaner,
    WebkitFormatCleaner: WebkitFormatCleaner
});

registerTool("insertHtml", new InsertHtmlTool({template: new ToolTemplate({template: EditorUtils.dropDownListTemplate, title: "Insert HTML", initialValue: "Insert HTML"})}));

})(window.kendo.jQuery);

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
