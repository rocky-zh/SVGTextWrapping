(function(f, define){
    define([ "./shapes" ], f);
})(function(){

(function ($) {

    // Imports ================================================================
    var doc = document,

        kendo = window.kendo,
        deepExtend = kendo.deepExtend,

        dataviz = kendo.dataviz,
        defined = dataviz.defined,
        renderTemplate = dataviz.renderTemplate,

        d = dataviz.drawing,
        BaseNode = d.BaseNode,

        util = dataviz.util,
        renderAttr = util.renderAttr,
        renderAllAttr = util.renderAllAttr,
        renderSize = util.renderSize;

    // Constants ==============================================================
    var BUTT = "butt",
        DASH_ARRAYS = dataviz.DASH_ARRAYS,
        NONE = "none",
        SOLID = "solid",
        SQUARE = "square",
        SVG_NS = "http://www.w3.org/2000/svg",
        TRANSPARENT = "transparent",
        UNDEFINED = "undefined";

    // SVG rendering surface ==================================================
    var Surface = d.Surface.extend({
        init: function(container, options) {
            d.Surface.fn.init.call(this);

            this.options = deepExtend({}, this.options, options);
            this.bind(this.events, this.options);

            this._root = new RootNode();
            this._click = this._handler("click");
            this._mouseenter = this._handler("mouseenter");
            this._mouseleave = this._handler("mouseleave");

            this._appendTo(container);
        },

        options: {
            width: "100%",
            height: "100%"
        },

        events: [
            "click",
            "mouseenter",
            "mouseleave"
        ],

        translate: function(offset) {
            var viewBox = kendo.format(
                "{0} {1} {2} {3}",
                offset.x, offset.y,
                this._size.width, this._size.height);

            this._offset = offset;
            this.element.setAttribute("viewBox", viewBox);
        },

        draw: function(element) {
            this._root.load([element]);
        },

        clear: function() {
            this._root.clear();
        },

        svg: function() {
            return this._template(this);
        },

        setSize: function(size) {
            this.element.setAttribute("width", renderSize(size.width));
            this.element.setAttribute("height", renderSize(size.height));
            this.resize();
        },

        _resize: function() {
            if (this._offset) {
                this.translate(this._offset);
            }
        },

        _template: renderTemplate(
            // TODO: Append XML prefix only during export
            "<?xml version='1.0' ?>" +
            "<svg xmlns='" + SVG_NS + "' version='1.1' " +
            "width='#= kendo.dataviz.util.renderSize(d.options.width) #' " +
            "height='#= kendo.dataviz.util.renderSize(d.options.height) #' " +
            "style='position: absolute;'>#= d._root.render() #</svg>"
        ),

        _appendTo: function(container) {
            renderSVG(container, this._template(this));
            this.element = container.firstElementChild;
            alignToScreen(this.element);

            this._root.attachTo(this.element);

            var element = $(this.element);

            element.on("click", this._click);
            element.on("mouseover", this._mouseenter);
            element.on("mouseout", this._mouseleave);

            this.resize();
        }
    });

    // SVG Node ================================================================
    var Node = BaseNode.extend({
        load: function(elements) {
            var node = this,
                element = node.element,
                childNode,
                srcElement,
                children,
                i;

            for (i = 0; i < elements.length; i++) {
                srcElement = elements[i];
                children = srcElement.children;

                if (srcElement instanceof d.Group) {
                    childNode = new GroupNode(srcElement);
                } else if (srcElement instanceof d.Path) {
                    childNode = new PathNode(srcElement);
                } else if (srcElement instanceof d.MultiPath) {
                    childNode = new MultiPathNode(srcElement);
                } else if (srcElement instanceof d.Circle) {
                    childNode = new CircleNode(srcElement);
                }

                if (children && children.length > 0) {
                    childNode.load(children);
                }

                node.append(childNode);

                if (element) {
                    childNode.attachTo(element);
                }
            }
        },

        attachTo: function(domElement) {
            var container = doc.createElement("div");
            renderSVG(container,
                "<svg xmlns='" + SVG_NS + "' version='1.1'>" +
                this.render() +
                "</svg>"
            );

            var element = container.firstChild.firstChild;
            if (element) {
                domElement.appendChild(element);
                this.setElement(element);
            }
        },

        setElement: function(element) {
            var nodes = this.childNodes,
                childElement,
                i;

            if (this.element) {
                this.element._kendoNode = null;
            }

            this.element = element;
            element._kendoNode = this;

            for (i = 0; i < nodes.length; i++) {
                childElement = element.childNodes[i];
                nodes[i].setElement(childElement);
            }
        },

        template: renderTemplate(
            "#= d.renderChildren() #"
        ),

        render: function() {
            return this.template(this);
        },

        renderChildren: function() {
            var nodes = this.childNodes,
                output = "",
                i;

            for (i = 0; i < nodes.length; i++) {
                output += nodes[i].render();
            }

            return output;
        },

        clear: function() {
            var element = this.element;

            if (element) {
                element.parentNode.removeChild(element);
                this.element = null;
            }

            BaseNode.fn.clear.call(this);
        }
    });

    var RootNode = Node.extend({
        attachTo: function(domElement) {
            this.element = domElement;
        },

        clear: BaseNode.fn.clear
    });

    var GroupNode = Node.extend({
        template: renderTemplate(
            "<g>#= d.renderChildren() #</g>"
        )
    });

    var PathNode = Node.extend({
        geometryChange: function() {
            this.attr("d", this.renderData());
            this.invalidate();
        },

        optionsChange: function(e) {
            switch(e.field) {
                case "fill":
                    this.allAttr(this.mapFill(e.value));
                    break;

                case "fill.color":
                    this.allAttr(this.mapFill({ color: e.value }));
                    break;

                case "stroke":
                    this.allAttr(this.mapStroke(e.value));
                    break;

                case "visible":
                    this.attr("visibility", e.value ? "visible" : "hidden");
                    break;

                default:
                    var name = this.attributeMap[e.field];
                    if (name) {
                        this.attr(name, e.value);
                    }
                    break;
            }

            this.invalidate();
        },

        attributeMap: {
            "fill.opacity": "fill-opacity",
            "stroke.color": "stroke",
            "stroke.width": "stroke-width",
            "stroke.opacity": "stroke-opacity"
        },

        attr: function(name, value) {
            if (this.element) {
                this.element.setAttribute(name, value);
            }
        },

        allAttr: function(attrs) {
            for (var i = 0; i < attrs.length; i++) {
                this.attr(attrs[i][0], attrs[i][1]);
            }
        },

        renderData: function() {
            return this.printPath(this.srcElement);
        },

        printPath: function(path) {
            var segments = path.segments;
            if (segments.length > 0) {
                var parts = [],
                    output,
                    i;

                for (i = 0; i < segments.length; i++) {
                    parts.push(segments[i].anchor.toString(1));
                }

                output = "M" + parts.join(" ");
                if (path.options.closed) {
                    output += "Z";
                }

                return output;
            }
        },

        mapStroke: function(stroke) {
            var attrs = [];

            if (stroke) {
                attrs.push(["stroke", stroke.color]);
                attrs.push(["stroke-width", stroke.width]);
                attrs.push(["stroke-linecap", this.renderLinecap(stroke)]);

                if (defined(stroke.opacity)) {
                    attrs.push(["stroke-opacity", stroke.opacity]);
                }

                if (defined(stroke.dashType)) {
                    attrs.push(["stroke-dasharray", this.renderDashType(stroke)]);
                }
            }

            return attrs;
        },

        renderStroke: function() {
            return renderAllAttr(
                this.mapStroke(this.srcElement.options.stroke)
            );
        },

        renderDashType: function (stroke) {
            var width = stroke.width || 1,
                dashType = stroke.dashType;

            if (dashType && dashType != SOLID) {
                var dashArray = DASH_ARRAYS[dashType.toLowerCase()],
                    result = [],
                    i;

                for (i = 0; i < dashArray.length; i++) {
                    result.push(dashArray[i] * width);
                }

                return result.join(" ");
            }
        },

        renderLinecap: function(stroke) {
            var dashType = stroke.dashType,
                lineCap = stroke.lineCap || SQUARE;

            return (dashType && dashType != SOLID) ? BUTT : lineCap;
        },

        mapFill: function(fill) {
            var attrs = [];

            if (fill && fill.color !== TRANSPARENT) {
                attrs.push(["fill", fill.color]);

                if (defined(fill.opacity)) {
                    attrs.push(["fill-opacity", fill.opacity]);
                }
            } else {
                attrs.push(["fill", NONE]);
            }

            return attrs;
        },

        renderFill: function() {
            return renderAllAttr(
                this.mapFill(this.srcElement.options.fill)
            );
        },

        renderCursor: function() {
            var cursor = this.srcElement.options.cursor;

            if (cursor) {
                return "cursor:" + cursor + ";";
            }
        },

        renderVisibility: function() {
            if (this.srcElement.options.visible === false) {
                return renderAttr("visibility", "hidden");
            }

            return "";
        },

        template: renderTemplate(
            "<path #= kendo.dataviz.util.renderAttr('style', d.renderCursor()) # " +
            "#= d.renderVisibility() # " +
            "#= kendo.dataviz.util.renderAttr('d', d.renderData()) # " +
            "#= d.renderStroke() # " +
            "#= d.renderFill() # " +
            "stroke-linejoin='round'></path>"
        )
    });

    var MultiPathNode = PathNode .extend({
        renderData: function() {
            var paths = this.srcElement.paths;

            if (paths.length > 0) {
                var result = [],
                    i;

                for (i = 0; i < paths.length; i++) {
                    result.push(this.printPath(paths[i]));
                }

                return result.join(" ");
            }
        }
    });

    var CircleNode = PathNode.extend({
        geometryChange: function() {
            var geometry = this.srcElement.geometry;
            this.attr("cx", geometry.center.x);
            this.attr("cy", geometry.center.y);
            this.attr("r", geometry.radius);
            this.invalidate();
        },

        template: renderTemplate(
            "<circle #= kendo.dataviz.util.renderAttr('style', d.renderCursor()) # " +
            "cx='#= this.srcElement.geometry.center.x #' cy='#= this.srcElement.geometry.center.y #' " +
            "r='#= this.srcElement.geometry.radius #' " +
            "#= d.renderVisibility() # " +
            "#= d.renderStroke() # " +
            "#= d.renderFill() #></circle>"
        )
    });

    // Helpers ================================================================
    var renderSVG = function(container, svg) {
        container.innerHTML = svg;
    };

    (function() {
        var testFragment = "<svg xmlns='" + SVG_NS + "'></svg>",
            testContainer = doc.createElement("div"),
            hasParser = typeof DOMParser != UNDEFINED;

        testContainer.innerHTML = testFragment;

        if (hasParser && testContainer.firstChild.namespaceURI != SVG_NS) {
            renderSVG = function(container, svg) {
                var parser = new DOMParser(),
                    chartDoc = parser.parseFromString(svg, "text/xml"),
                    importedDoc = doc.adoptNode(chartDoc.documentElement);

                container.innerHTML = "";
                container.appendChild(importedDoc);
            };
        }
    })();

    function alignToScreen(element) {
        var ctm;

        try {
            ctm = element.getScreenCTM ? element.getScreenCTM() : null;
        } catch (e) { }

        if (ctm) {
            var left = - ctm.e % 1,
                top = - ctm.f % 1,
                style = element.style;

            if (left !== 0 || top !== 0) {
                style.left = left + "px";
                style.top = top + "px";
            }
        }
    }

    // Exports ================================================================

    if (kendo.support.svg) {
        d.SurfaceFactory.current.register("svg", Surface, 10);
    }

    deepExtend(d, {
        svg: {
            CircleNode: CircleNode,
            GroupNode: GroupNode,
            MultiPathNode: MultiPathNode,
            Node: Node,
            PathNode: PathNode,
            RootNode: RootNode,
            Surface: Surface
        }
    });

})(window.kendo.jQuery);

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
