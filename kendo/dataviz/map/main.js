(function(f, define){
    define(["../geometry", "./crs", "./location"], f);
})(function(){

(function ($, undefined) {
    // Imports ================================================================
    var doc = document,
        math = Math,
        min = math.min,
        pow = math.pow,

        proxy = $.proxy,

        kendo = window.kendo,
        Widget = kendo.ui.Widget,
        deepExtend = kendo.deepExtend,

        dataviz = kendo.dataviz,
        ui = dataviz.ui,
        defined = dataviz.defined,

        g = dataviz.geometry,
        Point = g.Point,

        map = dataviz.map,
        Extent = map.Extent,
        Location = map.Location,
        EPSG3857 = map.crs.EPSG3857,

        util = dataviz.util,
        limit = util.limitValue,
        renderPos = util.renderPos,
        valueOrDefault = util.valueOrDefault;

    // Constants ==============================================================
    var CSS_PREFIX = "k-",
        FRICTION = 0.90,
        FRICTION_MOBILE = 0.93,
        MOUSEWHEEL = "DOMMouseScroll mousewheel",
        VELOCITY_MULTIPLIER = 5;

    // Map widget =============================================================
    var Map = Widget.extend({
        init: function(element, options) {
            kendo.destroy(element);
            Widget.fn.init.call(this, element);

            this._initOptions(options);
            this.bind(this.events, options);

            this.crs = new EPSG3857();

            this.element
                .addClass(CSS_PREFIX + this.options.name.toLowerCase())
                .css("position", "relative")
                .empty()
                .append(doc.createElement("div"));

            this._viewOrigin = this._getOrigin();
            this._initScroller();
            this._initMarkers();
            this._initControls();
            this._initLayers();
            this._reset();

            this._mousewheel = proxy(this._mousewheel, this);
            this.element.bind("click", proxy(this._click, this));
            this.element.bind(MOUSEWHEEL, this._mousewheel);
        },

        options: {
            name: "Map",
            controls: {
                attribution: true,
                navigator: {
                    panStep: 100
                },
                zoom: true
            },
            layers: [],
            layerDefaults: {
                shape: {
                    style: {
                        fill: {
                            color: "#fff"
                        },
                        stroke: {
                            color: "#aaa",
                            width: 0.5
                        }
                    }
                },
                marker: {
                    shape: "pinTarget",
                    tooltip: {
                        position: "top"
                    }
                }
            },
            center: [0, 0],
            zoom: 3,
            minSize: 256,
            minZoom: 1,
            maxZoom: 19,
            markers: [],
            markerDefaults: {
                shape: "pinTarget",
                tooltip: {
                    position: "top"
                }
            },
            wraparound: true
        },

        events:[
            "beforeReset",
            "click",
            "reset",
            "pan",
            "panEnd",
            "markerCreated",
            "shapeClick",
            "shapeCreated",
            "shapeMouseEnter",
            "shapeMouseLeave",
            "zoomStart",
            "zoomEnd"
        ],

        destroy: function() {
            this.scroller.destroy();

            if (this.navigator) {
                this.navigator.destroy();
            }

            if (this.attribution) {
                this.attribution.destroy();
            }

            if (this.zoomControl) {
                this.zoomControl.destroy();
            }

            this.markers.destroy();

            for (var i = 0; i < this.layers.length; i++) {
                this.layers[i].destroy();
            }

            Widget.fn.destroy.call(this);
        },

        zoom: function(level) {
            var options = this.options;

            if (defined(level)) {
                level = limit(level, options.minZoom, options.maxZoom);
                if (options.zoom !== level) {
                    options.zoom = level;
                    this._reset();
                }

                return this;
            } else {
                return options.zoom;
            }
        },

        center: function(center) {
            if (center) {
                this.options.center = Location.create(center).toArray();
                this._reset();

                return this;
            } else {
                return Location.create(this.options.center);
            }
        },

        extent: function(extent) {
            if (extent) {
                this._setExtent(extent);
                return this;
            } else {
                return this._getExtent();
            }
        },

        setOptions: function(options) {
            Widget.fn.setOptions.call(this, options);
            this._reset();
        },

        locationToLayer: function(location, zoom) {
            var clamp = !this.options.wraparound;
            location = Location.create(location);
            return this.crs.toPoint(location, this._layerSize(zoom), clamp);
        },

        layerToLocation: function(point, zoom) {
            var clamp = !this.options.wraparound;
            point = Point.create(point);
            return  this.crs.toLocation(point, this._layerSize(zoom), clamp);
        },

        locationToView: function(location) {
            location = Location.create(location);
            var origin = this.locationToLayer(this._viewOrigin);
            var point = this.locationToLayer(location);

            return point.subtract(origin);
        },

        viewToLocation: function(point, zoom) {
            var origin = this.locationToLayer(this._getOrigin(), zoom);
            point = Point.create(point);
            point = point.clone().add(origin);
            return this.layerToLocation(point, zoom);
        },

        eventOffset: function(e) {
            var offset = this.element.offset();
            var event = e.originalEvent || e;
            var x = valueOrDefault(event.pageX, event.clientX) - offset.left;
            var y = valueOrDefault(event.pageY, event.clientY) - offset.top;

            return new g.Point(x, y);
        },

        eventToView: function(e) {
            var cursor = this.eventOffset(e);
            return this.locationToView(this.viewToLocation(cursor));
        },

        eventToLayer: function(e) {
            return this.locationToLayer(this.eventToLocation(e));
        },

        eventToLocation: function(e) {
            var cursor = this.eventOffset(e);
            return this.viewToLocation(cursor);
        },

        viewSize: function() {
            var element = this.element;
            var scale = this._layerSize();
            var width = element.width();

            if (!this.options.wraparound) {
                width = min(scale, width);
            }
            return {
                width: width,
                height: min(scale, element.height())
            };
        },

        _setOrigin: function(origin, zoom) {
            var size = this.viewSize(),
                topLeft;

            origin = this._origin = Location.create(origin);
            topLeft = this.locationToLayer(origin, zoom);
            topLeft.x += size.width / 2;
            topLeft.y += size.height / 2;

            this.options.center = this.layerToLocation(topLeft, zoom).toArray();

            return this;
        },

        _getOrigin: function(invalidate) {
            var size = this.viewSize(),
                topLeft;

            if (invalidate || !this._origin) {
                topLeft = this.locationToLayer(this.center());
                topLeft.x -= size.width / 2;
                topLeft.y -= size.height / 2;

                this._origin = this.layerToLocation(topLeft);
            }

            return this._origin;
        },

        _setExtent: function(extent) {
            extent = Extent.create(extent);
            this.center(extent.center());

            var width = this.element.width();
            var height = this.element.height();
            for (var zoom = this.options.maxZoom; zoom >= this.options.minZoom; zoom--) {
                var nw = this.locationToLayer(extent.nw, zoom);
                var se = this.locationToLayer(extent.se, zoom);
                var layerWidth = math.abs(se.x - nw.x);
                var layerHeight = math.abs(se.y - nw.y);

                if (layerWidth <= width && layerHeight <= height) {
                    break;
                }
            }

            this.zoom(zoom);
        },

        _getExtent: function() {
            var nw = this._getOrigin();
            var bottomRight = this.locationToLayer(nw);
            var size = this.viewSize();

            bottomRight.x += size.width;
            bottomRight.y += size.height;

            var se = this.layerToLocation(bottomRight);
            return new Extent(nw, se);
        },

        _zoomAround: function(pivot, level) {
            this._setOrigin(this.layerToLocation(pivot, level), level);
            this.zoom(level);
        },

        _initControls: function() {
            var controls = this.options.controls;

            if (ui.Attribution && controls.attribution) {
                this._createAttribution(controls.attribution);
            }

            if (!kendo.support.mobileOS) {
                if (ui.Navigator && controls.navigator) {
                    this._createNavigator(controls.navigator);
                }

                if (ui.ZoomControl && controls.zoom) {
                    this._createZoomControl(controls.zoom);
                }
            }
        },

        _createControlElement: function(options, defaultPos) {
            var pos = options.position || defaultPos;
            var posSelector = "." + renderPos(pos).replace(" ", ".");
            var wrap = $(".k-map-controls" + posSelector, this.element);
            if (wrap.length === 0) {
                wrap = $("<div>")
                       .addClass("k-map-controls " + renderPos(pos))
                       .appendTo(this.element);
            }

            return $("<div>").appendTo(wrap);
        },

        _createAttribution: function(options) {
            var element = this._createControlElement(options, "bottomRight");
            this.attribution = new ui.Attribution(element, options);
        },

        _createNavigator: function(options) {
            var element = this._createControlElement(options, "topLeft");
            var navigator = this.navigator = new ui.Navigator(element, options);

            this._navigatorPan = proxy(this._navigatorPan, this);
            navigator.bind("pan", this._navigatorPan);

            this._navigatorCenter = proxy(this._navigatorCenter, this);
            navigator.bind("center", this._navigatorCenter);
        },

        _navigatorPan: function(e) {
            var map = this;
            var scroller = map.scroller;

            var x = scroller.scrollLeft + e.x;
            var y = scroller.scrollTop - e.y;

            var bounds = this._virtualSize;
            var height = this.element.height();
            var width = this.element.width();

            // TODO: Move limits in scroller
            x = limit(x, bounds.x.min, bounds.x.max - width);
            y = limit(y, bounds.y.min, bounds.y.max - height);

            map.scroller.one("scroll", function(e) { map._scrollEnd(e); });
            map.scroller.scrollTo(-x, -y);
        },

        _navigatorCenter: function() {
            this.center(this.options.center);
        },

        _createZoomControl: function(options) {
            var element = this._createControlElement(options, "topLeft");
            var zoomControl = this.zoomControl = new ui.ZoomControl(element, options);

            this._zoomControlChange = proxy(this._zoomControlChange, this);
            zoomControl.bind("change", this._zoomControlChange);
        },

        _zoomControlChange: function(e) {
            if (!this.trigger("zoomStart", { originalEvent: e })) {
                this.zoom(this.zoom() + e.delta);
                this.trigger("zoomEnd", { originalEvent: e });
            }
        },

        _initScroller: function() {
            var friction = kendo.support.mobileOS ? FRICTION_MOBILE : FRICTION;
            var zoomable = this.options.zoomable !== false;
            var scroller = this.scroller = new kendo.mobile.ui.Scroller(
                this.element.children(0), {
                    friction: friction,
                    velocityMultiplier: VELOCITY_MULTIPLIER,
                    zoom: zoomable,
                    mousewheelScrolling: false
                });

            scroller.bind("scroll", proxy(this._scroll, this));
            scroller.bind("scrollEnd", proxy(this._scrollEnd, this));
            scroller.userEvents.bind("gesturestart", proxy(this._scaleStart, this));
            scroller.userEvents.bind("gestureend", proxy(this._scale, this));

            this.scrollElement = scroller.scrollElement;
        },

        _initLayers: function() {
            var defs = this.options.layers,
                layers = this.layers = [];

            for (var i = 0; i < defs.length; i++) {
                var options = defs[i];
                var type = options.type || "shape";
                var defaults = this.options.layerDefaults[type];
                var impl = dataviz.map.layers[type];

                layers.push(new impl(this, deepExtend({}, defaults, options)));
            }
        },

        _initMarkers: function() {
            this.markers = new map.layers.MarkerLayer(this, this.options.markerDefaults);
            this.markers.add(this.options.markers);
        },

        _scroll: function(e) {
            var origin = this.locationToLayer(this._viewOrigin).round();
            var movable = e.sender.movable;

            var offset = new g.Point(movable.x, movable.y).multiply(-1).multiply(1/movable.scale);
            origin.x += offset.x;
            origin.y += offset.y;

            this._setOrigin(this.layerToLocation(origin));
            this.trigger("pan", {
                originalEvent: e,
                origin: this._getOrigin(),
                center: this.center()
            });
        },

        _scrollEnd: function(e) {
            this.trigger("panEnd", {
                originalEvent: e,
                origin: this._getOrigin(),
                center: this.center()
            });
        },

        _scaleStart: function(e) {
            if (this.trigger("zoomStart", { originalEvent: e })) {
                var touch = e.touches[1];
                if (touch) {
                    touch.cancel();
                }
            }
        },

        _scale: function(e) {
            var scale = this.scroller.movable.scale;
            var zoom = this._scaleToZoom(scale);
            var gestureCenter = new g.Point(e.center.x, e.center.y);
            var centerLocation = this.viewToLocation(gestureCenter, zoom);
            var centerPoint = this.locationToLayer(centerLocation, zoom);
            var originPoint = centerPoint.subtract(gestureCenter);

            this._zoomAround(originPoint, zoom);
            this.trigger("zoomEnd", { originalEvent: e });
        },

        _scaleToZoom: function(scaleDelta) {
            var scale = this._layerSize() * scaleDelta;
            var tiles = scale / this.options.minSize;
            var zoom = math.log(tiles) / math.log(2);

            return math.round(zoom);
        },

        _reset: function() {
            if (this.attribution) {
                this.attribution.filter(this.center(), this.zoom());
            }

            this._viewOrigin = this._getOrigin(true);
            this._resetScroller();
            this.trigger("beforeReset");
            this.trigger("reset");
        },

        _resetScroller: function() {
            var scroller = this.scroller;
            var x = scroller.dimensions.x;
            var y = scroller.dimensions.y;
            var scale = this._layerSize();
            var maxScale = 20 * scale;
            var nw = this.extent().nw;
            var topLeft = this.locationToLayer(nw).round();

            scroller.reset();
            scroller.userEvents.cancel();

            var maxZoom = this.options.maxZoom - this.zoom();
            scroller.dimensions.maxScale = pow(2, maxZoom);

            scroller.movable.round = true;

            var xBounds = { min: -topLeft.x, max: scale - topLeft.x };
            var yBounds = { min: -topLeft.y, max: scale - topLeft.y };

            if (this.options.wraparound) {
                xBounds.min = -maxScale;
                xBounds.max = maxScale;
            }

            if (this.options.pannable === false) {
                var viewSize = this.viewSize();
                xBounds.min = yBounds.min = 0;
                xBounds.max = viewSize.width;
                yBounds.max = viewSize.height;
            }

            x.makeVirtual();
            y.makeVirtual();
            x.virtualSize(xBounds.min, xBounds.max);
            y.virtualSize(yBounds.min, yBounds.max);

            this._virtualSize = { x: xBounds, y: yBounds };
        },

        _renderLayers: function() {
            var defs = this.options.layers,
                layers = this.layers = [],
                scrollWrap = this.scrollWrap;

            scrollWrap.empty();

            for (var i = 0; i < defs.length; i++) {
                var options = defs[i];
                var type = options.type || "shape";
                var defaults = this.options.layerDefaults[type];
                var impl = dataviz.map.layers[type];

                layers.push(new impl(this, deepExtend({}, defaults, options)));
            }
        },

        _layerSize: function(zoom) {
            zoom = valueOrDefault(zoom, this.options.zoom);
            return this.options.minSize * pow(2, zoom);
        },

        _click: function(e) {
            var cursor = this.eventOffset(e);
            this.trigger("click", {
                originalEvent: e,
                location: this.viewToLocation(cursor)
            });
        },

        _mousewheel: function(e) {
            e.preventDefault();
            var delta = dataviz.mwDelta(e) > 0 ? -1 : 1;
            var options = this.options;
            var fromZoom = this.zoom();
            var toZoom = limit(fromZoom + delta, options.minZoom, options.maxZoom);

            if (options.zoomable !== false && toZoom !== fromZoom) {
                if (!this.trigger("zoomStart", { originalEvent: e })) {
                    var cursor = this.eventOffset(e);
                    var location = this.viewToLocation(cursor);
                    var postZoom = this.locationToLayer(location, toZoom);
                    var origin = postZoom.subtract(cursor);
                    this._zoomAround(origin, toZoom);

                    this.trigger("zoomEnd", { originalEvent: e });
                }
            }
        }
    });

    // Exports ================================================================
    dataviz.ui.plugin(Map);

})(window.kendo.jQuery);

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
