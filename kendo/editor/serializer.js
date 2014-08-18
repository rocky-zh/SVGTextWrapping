(function(f, define){
    define([ "./dom" ], f);
})(function(){

(function($, undefined) {

// Imports ================================================================
var kendo = window.kendo;
var Editor = kendo.ui.editor;
var dom = Editor.Dom;
var extend = $.extend;

var fontSizeMappings = 'xx-small,x-small,small,medium,large,x-large,xx-large'.split(',');
var quoteRe = /"/g; //"
var brRe = /<br[^>]*>/i;
var pixelRe = /^\d+(\.\d*)?(px)?$/i;
var emptyPRe = /<p><\/p>/i;
var cssDeclaration = /([\w|\-]+)\s*:\s*([^;]+);?/i;
var sizzleAttr = /^sizzle-\d+/i;
var onerrorRe = /\s*onerror\s*=\s*(?:'|")?([^'">\s]*)(?:'|")?/i;

var div = document.createElement("div");
div.innerHTML = " <hr>";
var supportsLeadingWhitespace = div.firstChild.nodeType === 3;
div = null;

var Serializer = {
    toEditableHtml: function(html) {
        html = html || "";

        return html
            .replace(/<!\[CDATA\[(.*)?\]\]>/g, "<!--[CDATA[$1]]-->")
            .replace(/<script([^>]*)>(.*)?<\/script>/ig, "<telerik:script$1>$2<\/telerik:script>")
            .replace(/<img([^>]*)>/ig, function(match) {
                return match.replace(onerrorRe, "");
            })
            .replace(/(<\/?img[^>]*>)[\r\n\v\f\t ]+/ig, "$1");
    },

    _fillEmptyElements: function(body) {
        // fills empty elements to allow them to be focused
        $(body).find("p").each(function() {
            var p = $(this);
            if (/^\s*$/g.test(p.text()) && !p.find("img,input").length) {
                var node = this;
                while (node.firstChild && node.firstChild.nodeType != 3) {
                    node = node.firstChild;
                }

                if (node.nodeType == 1 && !dom.empty[dom.name(node)]) {
                    node.innerHTML = kendo.ui.editor.emptyElementContent;
                }
            }
        });
    },

    _removeSystemElements: function(body) {
        // removes persisted system elements
        $(".k-paste-container", body).remove();
    },

    _resetOrderedLists: function(root){
        // fix for IE9 OL bug -- https://connect.microsoft.com/IE/feedback/details/657695/ordered-list-numbering-changes-from-correct-to-0-0
        var ols = root.getElementsByTagName("ol"), i, ol, originalStart;

        for (i = 0; i < ols.length; i++) {
            ol = ols[i];
            originalStart = ol.getAttribute("start");

            ol.setAttribute("start", 1);

            if (originalStart) {
                ol.setAttribute("start", originalStart);
            } else {
                ol.removeAttribute(originalStart);
            }
        }
    },

    htmlToDom: function(html, root) {
        var browser = kendo.support.browser;
        var msie = browser.msie;
        var legacyIE = msie && browser.version < 9;

        html = Serializer.toEditableHtml(html);

        if (legacyIE) {
            // Internet Explorer removes comments from the beginning of the html
            html = "<br/>" + html;

            var originalSrc = "originalsrc",
                originalHref = "originalhref";

            // IE < 8 makes href and src attributes absolute
            html = html.replace(/href\s*=\s*(?:'|")?([^'">\s]*)(?:'|")?/, originalHref + '="$1"');
            html = html.replace(/src\s*=\s*(?:'|")?([^'">\s]*)(?:'|")?/, originalSrc + '="$1"');

        }

        root.innerHTML = html;

        if (legacyIE) {
            dom.remove(root.firstChild);

            $(root).find("telerik\\:script,script,link,img,a").each(function () {
                var node = this;
                if (node[originalHref]) {
                    node.setAttribute("href", node[originalHref]);
                    node.removeAttribute(originalHref);
                }
                if (node[originalSrc]) {
                    node.setAttribute("src", node[originalSrc]);
                    node.removeAttribute(originalSrc);
                }
            });
        } else if (msie) {
            // having unicode characters creates denormalized DOM tree in IE9
            dom.normalize(root);

            Serializer._resetOrderedLists(root);
        }

        Serializer._fillEmptyElements(root);

        Serializer._removeSystemElements(root);

        // add k-table class to all tables
        $("table", root).addClass("k-table");

        return root;
    },

    domToXhtml: function(root, options) {
        var result = [];
        var tagMap = {
            'telerik:script': {
                start: function (node) { result.push('<script'); attr(node); result.push('>'); },
                end: function () { result.push('</script>'); },
                skipEncoding: true
            },
            b: {
                start: function () { result.push('<strong>'); },
                end: function () { result.push('</strong>'); }
            },
            i: {
                start: function () { result.push('<em>'); },
                end: function () { result.push('</em>'); }
            },
            u: {
                start: function () { result.push('<span style="text-decoration:underline;">'); },
                end: function () { result.push('</span>'); }
            },
            iframe: {
                start: function (node) { result.push('<iframe'); attr(node); result.push('>'); },
                end: function () { result.push('</iframe>'); }
            },
            font: {
                start: function (node) {
                    result.push('<span style="');

                    var color = node.getAttribute('color');
                    var size = fontSizeMappings[node.getAttribute('size')];
                    var face = node.getAttribute('face');

                    if (color) {
                        result.push('color:');
                        result.push(dom.toHex(color));
                        result.push(';');
                    }

                    if (face) {
                        result.push('font-face:');
                        result.push(face);
                        result.push(';');
                    }

                    if (size) {
                        result.push('font-size:');
                        result.push(size);
                        result.push(';');
                    }

                    result.push('">');
                },
                end: function () {
                    result.push('</span>');
                }
            }
        };

        function styleAttr(cssText) {
            // In IE < 8 the style attribute does not return proper nodeValue
            var trim = $.trim;
            var css = trim(cssText).split(';');
            var i, length = css.length;
            var match;
            var property, value;

            for (i = 0, length = css.length; i < length; i++) {
                if (!css[i].length) {
                    continue;
                }

                match = cssDeclaration.exec(css[i]);

                // IE8 does not provide a value for 'inherit'
                if (!match) {
                    continue;
                }

                property = trim(match[1].toLowerCase());
                value = trim(match[2]);

                if (property == "font-size-adjust" || property == "font-stretch") {
                    continue;
                }

                if (property.indexOf('color') >= 0) {
                    value = dom.toHex(value);
                } else if (property.indexOf('font') >= 0) {
                    value = value.replace(quoteRe, "'");
                } else if (/\burl\(/g.test(value)) {
                    value = value.replace(quoteRe, "");
                }

                result.push(property);
                result.push(':');
                result.push(value);
                result.push(';');
            }
        }

        function attr(node) {
            var specifiedAttributes = [];
            var attributes = node.attributes;
            var attribute, i, l;
            var name, value, specified;

            if (dom.is(node, 'img')) {
                var width = node.style.width,
                    height = node.style.height,
                    $node = $(node);

                if (width && pixelRe.test(width)) {
                    $node.attr('width', parseInt(width, 10));
                    dom.unstyle(node, { width: undefined });
                }

                if (height && pixelRe.test(height)) {
                    $node.attr('height', parseInt(height, 10));
                    dom.unstyle(node, { height: undefined });
                }
            }

            for (i = 0, l = attributes.length; i < l; i++) {
                attribute = attributes[i];

                name = attribute.nodeName;
                value = attribute.nodeValue;
                specified = attribute.specified;

                // In IE < 8 the 'value' attribute is not returned as 'specified'. The same goes for type="text"
                if (name == 'value' && 'value' in node && node.value) {
                    specified = true;
                } else if (name == 'type' && value == 'text') {
                    specified = true;
                } else if (name == "class" && !value) {
                    specified = false;
                } else if (sizzleAttr.test(name)) {
                    specified = false;
                } else if (name == 'complete') {
                    specified = false;
                } else if (name == 'altHtml') {
                    specified = false;
                } else if (name == 'start' && (dom.is(node, "ul") || dom.is(node, "ol"))) {
                    specified = false;
                } else if (name.indexOf('_moz') >= 0) {
                    specified = false;
                }

                if (specified) {
                    specifiedAttributes.push(attribute);
                }
            }

            if (!specifiedAttributes.length) {
                return;
            }

            specifiedAttributes.sort(function (a, b) {
                return a.nodeName > b.nodeName ? 1 : a.nodeName < b.nodeName ? -1 : 0;
            });

            for (i = 0, l = specifiedAttributes.length; i < l; i++) {
                attribute = specifiedAttributes[i];
                name = attribute.nodeName;
                value = attribute.nodeValue;

                if (name == "class" && value == "k-table") {
                    continue;
                }

                result.push(' ');
                result.push(name);
                result.push('="');

                if (name == 'style') {
                    styleAttr(value || node.style.cssText);
                } else if (name == 'src' || name == 'href') {
                    result.push(node.getAttribute(name, 2));
                } else {
                    result.push(dom.fillAttrs[name] ? name : value);
                }

                result.push('"');
            }
        }

        function children(node, skip, skipEncoding) {
            for (var childNode = node.firstChild; childNode; childNode = childNode.nextSibling) {
                child(childNode, skip, skipEncoding);
            }
        }

        function text(node) {
            return node.nodeValue.replace(/\ufeff/g, "");
        }

        function child(node, skip, skipEncoding) {
            var nodeType = node.nodeType,
                tagName, mapper,
                parent, value, previous;

            if (nodeType == 1) {
                tagName = dom.name(node);

                if (!tagName || dom.insignificant(node)) {
                    return;
                }

                if (dom.isInline(node) && node.childNodes.length == 1 && node.firstChild.nodeType == 3&&  !text(node.firstChild)) {
                    return;
                }

                mapper = tagMap[tagName];

                if (mapper) {
                    mapper.start(node);
                    children(node, false, mapper.skipEncoding);
                    mapper.end(node);
                    return;
                }

                result.push('<');
                result.push(tagName);

                attr(node);

                if (dom.empty[tagName]) {
                    result.push(' />');
                } else {
                    result.push('>');
                    children(node, skip || dom.is(node, 'pre'));
                    result.push('</');
                    result.push(tagName);
                    result.push('>');
                }
            } else if (nodeType == 3) {
                value = text(node);

                if (!skip && supportsLeadingWhitespace) {
                    parent = node.parentNode;
                    previous = node.previousSibling;

                    if (!previous) {
                         previous = (dom.isInline(parent) ? parent : node).previousSibling;
                    }

                    if (!previous || previous.innerHTML === "" || dom.isBlock(previous)) {
                        value = value.replace(/^[\r\n\v\f\t ]+/, '');
                    }

                    value = value.replace(/ +/, ' ');
                }

                result.push(skipEncoding ? value : dom.encode(value, options));

            } else if (nodeType == 4) {
                result.push('<![CDATA[');
                result.push(node.data);
                result.push(']]>');
            } else if (nodeType == 8) {
                if (node.data.indexOf('[CDATA[') < 0) {
                    result.push('<!--');
                    result.push(node.data);
                    result.push('-->');
                } else {
                    result.push('<!');
                    result.push(node.data);
                    result.push('>');
                }
            }
        }

        if (root.childNodes.length == 1 && root.firstChild.nodeType == 3) {
            return dom.encode(text(root.firstChild).replace(/[\r\n\v\f\t ]+/, ' '), options);
        }

        children(root);

        result = result.join('');

        // if serialized dom contains only whitespace elements, consider it empty (required field validation)
        if (result.replace(brRe, "").replace(emptyPRe, "") === "") {
            return "";
        }

        return result;
    }

};

extend(Editor, {
    Serializer: Serializer
});

})(window.kendo.jQuery);

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });



