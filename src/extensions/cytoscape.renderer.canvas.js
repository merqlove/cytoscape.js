(function($$){

	var time = function() { return Date.now(); } ; var arrowShapes = {}; var nodeShapes = {}; var rendFunc = CanvasRenderer.prototype;

	function CanvasRenderer(options) {
		
		this.data = {
			select: [0, 0, 0, 0, 0], 
			renderer: this,
			cy: options.cy,
			container: options.cy.container(),
			canvases: [null, null, null, null, null, 
				[], [], [], [], [],
				false, false, false, false, false],			
			
			banvases: [null, null],
		};
		
		//--Pointer-related data
		this.hoverData = {down: null, last: null, downTime: null, triggerMode: null, dragging: false, initialPan: [null, null], capture: false};
		this.timeoutData = {panTimeout: null};
		this.dragData = {possibleDragElements: []};
		
		this.touchData = {start: null, capture: false, now: [null, null, null, null, null, null], earlier: [null, null, null, null, null, null] };
		//--
		
		//--Wheel-related data
		this.zoomData = {freeToZoom: false, lastPointerX: null};
		//--
		
		this.redraws = 0;
		
		this.init();
		
		for (var i = 0; i < 5; i++) {
			this.data.canvases[i] = document.createElement("canvas");
			this.data.canvases[i].style.position = "absolute";
			this.data.canvases[i].id = "layer" + i;
			this.data.canvases[i].style.zIndex = String(-i);
			this.data.canvases[i].style.visibility = "hidden"; 
			this.data.container.appendChild(this.data.canvases[i]);
		}
		
		for (var i = 0; i < 2; i++) {
			this.data.banvases[i] = document.createElement("canvas");
			this.data.banvases[i].style.position = "absolute";
			this.data.banvases[i].id = "buffer" + i;
			this.data.banvases[i].style.zIndex = String(-i);
			this.data.banvases[i].style.visibility = "visible";
			this.data.container.appendChild(this.data.banvases[i]);
		}
	}

	CanvasRenderer.prototype.notify = function(params) {
		if (params.type == "add"
			|| params.type == "remove") {
			
			this.updateNodesCache();
			this.updateEdgesCache();
		}
		
		if (params.type == "load") { this.load(); }

		if (params.type == "viewport") {
			this.data.canvases[10+0] = true;
			this.data.canvases[5+0].push("viewchange");
			this.data.canvases[10+2] = true;
			this.data.canvases[5+2].push("viewchange");
			this.data.canvases[10+4] = true;
			this.data.canvases[5+4].push("viewchange");
		}
		
		this.data.canvases[10+2] = true; this.data.canvases[5+2].push("x");
		this.data.canvases[10+4] = true; this.data.canvases[5+4].push("x");

		this.redraws++;
		this.redraw();
	};
	
	// @O Initialization functions
	{
	CanvasRenderer.prototype.load = function() {
		var r = this;

		// Primary key
		r.data.container.addEventListener("mousedown", function(e) {
		
			r.hoverData.capture = true;
			
			var cy = r.data.cy; var pos = r.projectIntoViewport(e.pageX, e.pageY);
			var select = r.data.select;
			
			var near = r.findNearestElement(pos[0], pos[1]);
			var down = r.hoverData.down;
			var draggedElements = r.dragData.possibleDragElements;

			// Primary button
			if (e.button == 0) {
				
				// Element dragging
				{
					if (near && near._private.grabbable) {
						if (near._private.group == "nodes" && near._private.selected == false) 
							{ near._private.grabbed = true; near.trigger(new $$.Event(e, {type: "grab"})); 
							
							var unselectEvent = new $$.Event(e, {type: "unselect"});
							var ungrabEvent = new $$.Event(e, {type: "free"});
							
							for (var i=0;i<draggedElements.length;i++) {
								var popped = draggedElements[i];
								
								var updateStyle = false; if (popped._private.selected || popped._private.grabbed) { updateStyle = true; }
								
								if (popped._private.selected) { popped._private.selected = false; popped.trigger(unselectEvent); }
								if (popped._private.grabbed) { popped._private.grabbed = false; popped.trigger(ungrabEvent); }
								
								if (updateStyle) { popped.updateStyle(false); };
							}
							
							r.dragData.possibleDragElements = draggedElements = []; draggedElements.push(near);
								for (var i=0;i<near._private.edges.length;i++) { near._private.edges[i]._private.grabbed = true; }; }
								
						if (near._private.group == "nodes" && near._private.selected == true) {
							
							var event = new $$.Event(e, {type: "grab"}); 
							for (var i=0;i<draggedElements.length;i++) {
								draggedElements[i]._private.grabbed = true; var subEdges = draggedElements[i]._private.edges;
								
								for (var j=0;j<subEdges.length;j++) { subEdges[j]._private.grabbed = true; }
								
								draggedElements[i].trigger(event)
							};
						}
								
						r.data.canvases[10+2] = true; r.data.canvases[5+2].push("Single node moved to drag layer"); 
						r.data.canvases[10+4] = true; r.data.canvases[5+4].push("Single node moved to drag layer");
						
//						console.log(draggedElements);
					}
					
					if (near) { near.trigger(new $$.Event(e, {type: "mousedown"})); }
					
					r.hoverData.down = near;
					r.hoverData.downTime = (new Date()).getTime();
				}
			
				// Selection box
				if (near == null) { select[4] = 1; }
			
			// Middle/auxilliary button
			} else if (e.button == 1) {
				
				// Drag pan
				r.hoverData.dragging = true;
				r.hoverData.initialPan = [cy.pan().x, cy.pan().y];
				
			}
			
			select[0] = select[2] = pos[0]; select[1] = select[3] = pos[1];
			
			r.redraw();
			
		}, false);
		
		window.addEventListener("mousemove", function(e) {
			
			var cy = r.data.cy; var pos = r.projectIntoViewport(e.pageX, e.pageY); var select = r.data.select;
			var near = r.findNearestElement(pos[0], pos[1]); var last = r.hoverData.last; var down = r.hoverData.down;
			var disp = [pos[0] - select[2], pos[1] - select[3]]; var nodes = r.getCachedNodes(); var edges = r.getCachedEdges(); var draggedElements = r.dragData.possibleDragElements;
			
			var capture = r.hoverData.capture; if (!capture) { 
				
				var containerPageCoords = r.findContainerPageCoords();
				
				if (e.pageX > containerPageCoords[0] && e.pageX < containerPageCoords[0] + r.data.container.clientWidth
					&& e.pageY > containerPageCoords[1] && e.pageY < containerPageCoords[1] + r.data.container.clientHeight) {
					
				} else {
					return;
				}
			}
			
			if (r.hoverData.dragging) {
				
				// console.log(pos[0], select[0], r.hoverData.initialPan[0], pos[1], select[1], r.hoverData.initialPan[1]);
				
				cy.panBy({x: disp[0] * cy.zoom(), y: disp[1] * cy.zoom()});
				
				// Needs reproject due to pan changing viewport
				pos = r.projectIntoViewport(e.pageX, e.pageY);
			
			// Mousemove event
			{
				var event = new $$.Event(e, {type: "mousemove"});
				
				if (near != null) {
					near.trigger(event);
				} else if (near == null) {
					cy.trigger(event);
				}
			}
			
			// Checks primary button down & out of time & mouse not moved much
			} else if (select[4] == 1 && down == null && (new Date()).getTime() - r.hoverData.downTime > 200 && (Math.abs(select[3] - select[1]) + Math.abs(select[2] - select[0]) < 4)) {
				
				r.hoverData.dragging = true;
				select[4] = 0;
				
			} else {
				if (near != last) {
					
					if (last) { last.trigger(new $$.Event(e, {type: "mouseout"})); }
					if (near) { near.trigger(new $$.Event(e, {type: "mouseover"})); }
					
					r.hoverData.last = near;
				}
				
				if (down) {
					var drag = new $$.Event(e, {type: "position"});
				
					for (var i=0;i<draggedElements.length;i++) {
					
						// Locked nodes not draggable
						if (!draggedElements[i]._private.locked 
							&& draggedElements[i]._private.group == "nodes") {
							
							draggedElements[i]._private.position.x += disp[0]; draggedElements[i]._private.position.y += disp[1];
							draggedElements[i].trigger(drag);
						}
					}
					
					r.data.canvases[10+2] = true; r.data.canvases[5+2].push("Nodes dragged");
				}
				
				if (near) {
					near.trigger(new $$.Event(e, {type: "mousemove"}));
				}
				
				r.data.canvases[10+0] = true; r.data.canvases[5+0].push("Mouse moved, redraw selection box");
			}
			
			select[2] = pos[0]; select[3] = pos[1];
			
			r.redraw();
			
		}, false);
		
		window.addEventListener("mouseup", function(e) {
			
			var capture = r.hoverData.capture; if (!capture) { return; }; r.hoverData.capture = false;
		
			var cy = r.data.cy; var pos = r.projectIntoViewport(e.pageX, e.pageY); var select = r.data.select;
			var near = r.findNearestElement(pos[0], pos[1]); var nodes = r.getCachedNodes(); var edges = r.getCachedEdges(); var draggedElements = r.dragData.possibleDragElements; var down = r.hoverData.down;
			
			if (near == null || near != down || !near.selected()) {

//++clock+unselect
//				var a = time();
				
				var unselectEvent = new $$.Event(e, {type: "unselect"}); for (var i=0;i<draggedElements.length;i++) { if (draggedElements[i]._private.selected) { draggedElements[i]._private.selected = false; draggedElements[i].trigger(unselectEvent); draggedElements[i].updateStyle(false); } } 
				
//++clock+unselect
//				console.log("unselect", time() - a);
				
				if (draggedElements.length > 0) { r.data.canvases[10+4] = true; r.data.canvases[5+4].push("De-select"); }
				draggedElements = r.dragData.possibleDragElements = [];
			}
			
			// Click event
			{
				if (Math.pow(select[2] - select[0], 2) + Math.pow(select[3] - select[1], 2) == 0) {
					var klickEvent = new $$.Event(e, {type: "click"});
					
					if (near != null) {
						near.trigger(klickEvent);
					} else if (near == null) {
						cy.trigger(klickEvent);
					}
				}
			} 
			
			// Mouseup event
			{
				var upEvent = new $$.Event(e, {type: "mouseup"});
				
				if (near != null) {
					near.trigger(upEvent);
				} else if (near == null) {
					cy.trigger(upEvent);
				}
			}
			
			if (near == down && (Math.pow(select[2] - select[0], 2) + Math.pow(select[3] - select[1], 2) < 7)) {
				if (near != null && near._private.selectable && near._private.selected == false) {
					near._private.selected = true; near.trigger(new $$.Event(e, {type: "select"})); near.updateStyle(false);
					draggedElements.push(near);
					
					r.data.canvases[10+4] = true; r.data.canvases[5+4].push("sglslct");
					
				}
			// Ungrab single drag
			} else if (near == down) {
				if (near != null && near._private.grabbed) {
					var freeEvent = new $$.Event(e, {type: "free"});
					
					near._private.grabbed = false; near.trigger(freeEvent);
					
					var sEdges = near._private.edges; for (var j=0;j<sEdges.length;j++) { sEdges[j]._private.grabbed = false; } 		
				}
			}
			
			if (Math.pow(select[2] - select[0], 2) + Math.pow(select[3] - select[1], 2) > 7 && select[4]) {
//				console.log("selecting");
				
				var box = r.getAllInBox(select[0], select[1], select[2], select[3]);
				// console.log(box);
				var event = new $$.Event(e, {type: "select"});
				for (var i=0;i<box.length;i++) { if (box[i]._private.selectable) {
					box[i]._private.selected = true; box[i].trigger(event); box[i].updateStyle(false); draggedElements.push(box[i]); } }
				
				if (box.length > 0) { r.data.canvases[10+4] = true; r.data.canvases[5+4].push("Selection"); }
			}
			
			// Cancel drag pan
			r.hoverData.dragging = false;
			
			if (!select[4]) {
				var freeEvent = new $$.Event(e, {type: "free"}); for (var i=0;i<draggedElements.length;i++) { draggedElements[i]._private.grabbed = false; 
					if (draggedElements[i]._private.group == "nodes") { 
						var sEdges = draggedElements[i]._private.edges; for (var j=0;j<sEdges.length;j++) { sEdges[j]._private.grabbed = false; } 
					} draggedElements[i].trigger(freeEvent); }
//				draggedElements = r.dragData.possibleDragElements = [];
				r.data.canvases[10+2] = true; r.data.canvases[5+2].push("Node/nodes back from drag");
				r.data.canvases[10+4] = true; r.data.canvases[5+4].push("Node/nodes back from drag");
			}
			
			select[4] = 0; r.hoverData.down = null;
			
			r.data.canvases[10+0] = true; r.data.canvases[5+0].push("Mouse up, selection box gone");
			
//			console.log("mu", pos[0], pos[1]);
//			console.log("ss", select);
			
			r.redraw();
			
		}, false);
		
		var wheelHandler = function(e) {
			
			var cy = r.data.cy; var pos = r.projectIntoViewport(e.pageX, e.pageY);
			
			var unpos = [pos[0] * cy.zoom() + cy.pan().x,
			              pos[1] * cy.zoom() + cy.pan().y];
			
//			console.log("update");
			
			if (r.zoomData.freeToZoom) {
				e.preventDefault();
				
				var diff = e.wheelDeltaY / 1000 || e.detail / -8.4;
				
//				console.log({level: cy.zoom() * (1 + diff), position: {x: unpos[0], y: unpos[1]}});
				cy.zoom({level: cy.zoom() * (1 + diff), position: {x: unpos[0], y: unpos[1]}});
//				console.log("new zoom" + cy.zoom());
			}

		}
		
		// Uses old functions
		// --
		r.data.container.addEventListener("mousewheel", wheelHandler, false);
		r.data.container.addEventListener("DOMMouseScroll", wheelHandler, false);
		r.data.container.addEventListener("mousemove", function(e) { 
			if (r.zoomData.lastPointerX && r.zoomData.lastPointerX != e.pageX && !r.zoomData.freeToZoom) 
				{ r.zoomData.freeToZoom = true; } r.zoomData.lastPointerX = e.pageX; }, false);
		r.data.container.addEventListener("mouseout", function(e) { 
			r.zoomData.freeToZoom = false; r.zoomData.lastPointerX = null }, false);
		// --
		
		
		r.data.container.addEventListener("touchstart", function(e) {
			e.preventDefault();
		
			r.touchData.capture = true;
		
			var cy = r.data.cy; 
			var nodes = r.getCachedNodes(); var edges = r.getCachedEdges();
			var now = r.touchData.now; var earlier = r.touchData.earlier;
			
			if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].pageX, e.touches[0].pageY); now[0] = pos[0]; now[1] = pos[1]; }
			if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].pageX, e.touches[1].pageY); now[2] = pos[0]; now[3] = pos[1]; }
			if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].pageX, e.touches[2].pageY); now[4] = pos[0]; now[5] = pos[1]; }
			
			if (e.touches[2]) {
			
			} else if (e.touches[1]) {
				
			} else if (e.touches[0]) {
				var near = r.findNearestElement(now[0], now[1]);
				
				if (near != null) {
					r.touchData.start = near;
					
					if (near._private.group == "nodes") {
						
						near._private.grabbed = true; near.trigger(new $$.Event(e, {type: "grab"}));
						r.data.canvases[10+2] = true; r.data.canvases[5+2].push("touchdrag node start");
						r.data.canvases[10+4] = true; r.data.canvases[5+4].push("touchdrag node start");
						
						var sEdges = near._private.edges;
						for (var j=0;j<sEdges.length;j++) { sEdges[j]._private.grabbed = true; }
					}
					
					near.trigger(new $$.Event(e, {type: "touchstart"}));
				} else if (near == null) {
					cy.trigger(new $$.Event(e, {type: "touchstart"}));
				}
			}
			
			for (var j=0;j<now.length;j++) { earlier[j] = now[j]; };
			r.redraw();
			
		}, true);
		
		window.addEventListener("touchmove", function(e) {
		
			var capture = r.touchData.capture; if (!capture) { return; }; 
			e.preventDefault();
		
			var cy = r.data.cy; 
			var nodes = r.getCachedNodes(); var edges = r.getCachedEdges();
			var now = r.touchData.now; var earlier = r.touchData.earlier;
			
			if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].pageX, e.touches[0].pageY); now[0] = pos[0]; now[1] = pos[1]; }
			if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].pageX, e.touches[1].pageY); now[2] = pos[0]; now[3] = pos[1]; }
			if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].pageX, e.touches[2].pageY); now[4] = pos[0]; now[5] = pos[1]; }
			var disp = []; for (var j=0;j<now.length;j++) { disp[j] = now[j] - earlier[j]; }
			
			if (e.touches[2]) {
			
			} else if (e.touches[1]) {
				var avgDsp = [(disp[0] + disp[2]) / 2, (disp[1] + disp[3]) / 2]
				
				cy.panBy({x: avgDsp[0] * cy.zoom(), y: avgDsp[1] * cy.zoom()});
				
				
				var earlierDist = Math.sqrt(Math.pow(earlier[2] - earlier[0], 2) + Math.pow(earlier[3] - earlier[1], 2));
				var nowDist = Math.sqrt(Math.pow(now[2] - now[0], 2) + Math.pow(now[3] - now[1], 2));
				
				var factor = nowDist / earlierDist;
				
				if (factor > 1) {
					factor = (factor - 1) * 1.5 + 1;
				} else {
					factor = 1 - (1 - factor) * 1.5;
				}
				
				cy.zoom({level: cy.zoom() * factor,
					position: {x: (now[0] + now[2]) / 2,
								y: (now[1] + now[3]) / 2}});
				
				// Re-project
				if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].pageX, e.touches[0].pageY); now[0] = pos[0]; now[1] = pos[1]; }
				if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].pageX, e.touches[1].pageY); now[2] = pos[0]; now[3] = pos[1]; }
				if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].pageX, e.touches[2].pageY); now[4] = pos[0]; now[5] = pos[1]; }
				
			} else if (e.touches[0]) {
				var start = r.touchData.start;
				
				if (start != null && start._private.group == "nodes") {
					start._private.position.x += disp[0]; start._private.position.y += disp[1];
					
					r.data.canvases[10+2] = true; r.data.canvases[5+2].push("touchdrag node");
//					r.data.canvases[10+4] = true; r.data.canvases[5+4].push("touchdrag node");
					
					start.trigger(new $$.Event(e, {type: "position"}));
				}
				
				// Touchmove event
				{
					if (start != null) { start.trigger(new $$.Event(e, {type: "touchmove"})); }
					
					if (start == null) { 
						var near = r.findNearestElement(now[0], now[1]);
						if (near != null) { near.trigger(new $$.Event(e, {type: "touchmove"})); }
						if (near == null) {   cy.trigger(new $$.Event(e, {type: "touchmove"})); }
					}
				}
				
				if (start == null) {
					cy.panBy({x: disp[0] * cy.zoom(), y: disp[1] * cy.zoom()});
					
					// Re-project
					var pos = r.projectIntoViewport(e.touches[0].pageX, e.touches[0].pageY);
					now[0] = pos[0]; now[1] = pos[1];
				}
			}
			
			for (var j=0;j<now.length;j++) { earlier[j] = now[j]; };
			r.redraw();
			
		}, true);
		
		window.addEventListener("touchend", function(e) {
			
			var capture = r.touchData.capture; if (!capture) { return; }; r.touchData.capture = false;
			e.preventDefault();
			
			var cy = r.data.cy; 
			var nodes = r.getCachedNodes(); var edges = r.getCachedEdges();
			var now = r.touchData.now; var earlier = r.touchData.earlier;
			
			if (e.touches[0]) { var pos = r.projectIntoViewport(e.touches[0].pageX, e.touches[0].pageY); now[0] = pos[0]; now[1] = pos[1]; }
			if (e.touches[1]) { var pos = r.projectIntoViewport(e.touches[1].pageX, e.touches[1].pageY); now[2] = pos[0]; now[3] = pos[1]; }
			if (e.touches[2]) { var pos = r.projectIntoViewport(e.touches[2].pageX, e.touches[2].pageY); now[4] = pos[0]; now[5] = pos[1]; }
			
			if (e.touches[2]) {
			
			} else if (e.touches[1]) {
				
			} else if (e.touches[0]) {
			
			} else if (!e.touches[0]) {
			
				var start = r.touchData.start;
				
				if (start != null ) {
					if (start._private.grabbed == true) {
						start._private.grabbed = false; start.trigger(new $$.Event(e, {type: "free"}));
					}
					
					var sEdges = start._private.edges;
					for (var j=0;j<sEdges.length;j++) { sEdges[j]._private.grabbed = false; }
					
					r.data.canvases[10+2] = true; r.data.canvases[5+2].push("touchdrag node end");
					r.data.canvases[10+4] = true; r.data.canvases[5+4].push("touchdrag node end");
					
					start.trigger(new $$.Event(e, {type: "touchend"}));
					
					r.touchData.start = null;
					
				} else {
					var near = r.findNearestElement(now[0], now[1]);
				
					if (near != null) { near.trigger(new $$.Event(e, {type: "touchend"})); }
					if (near == null) { cy.trigger(new $$.Event(e, {type: "touchend"})); }
				}
				
			}
			
			for (var j=0;j<now.length;j++) { earlier[j] = now[j]; };
			r.redraw();
			
		}, true);
	};
	
	CanvasRenderer.prototype.init = function() { };
	}
	
	// @O Caching functions
	{
	CanvasRenderer.prototype.getCachedNodes = function() {
		var data = this.data; var cy = this.data.cy;
		
		if (data.cache == undefined) {
			data.cache = {};
		}
		
		if (data.cache.cachedNodes == undefined) {
			data.cache.cachedNodes = cy.nodes();
		}
		
		return data.cache.cachedNodes;
	}
	
	CanvasRenderer.prototype.updateNodesCache = function() {
		var data = this.data; var cy = this.data.cy;
		
		if (data.cache == undefined) {
			data.cache = {};
		}
		
		data.cache.cachedNodes = cy.nodes();
	}
	
	CanvasRenderer.prototype.getCachedEdges = function() {
		var data = this.data; var cy = this.data.cy;
		
		if (data.cache == undefined) {
			data.cache = {};
		}
		
		if (data.cache.cachedEdges == undefined) {
			data.cache.cachedEdges = cy.edges();
		}
		
		return data.cache.cachedEdges;
	}
	
	CanvasRenderer.prototype.updateEdgesCache = function() {
		var data = this.data; var cy = this.data.cy;
		
		if (data.cache == undefined) {
			data.cache = {};
		}
		
		data.cache.cachedEdges = cy.edges();
	}
	}
	
	// @O High-level collision application functions

	// Project mouse
	CanvasRenderer.prototype.projectIntoViewport = function(pageX, pageY) {
		
		var x, y; var offsetLeft = 0; var offsetTop = 0; var n; n = this.data.container;
		
		// Stop checking scroll past the level of the DOM tree containing document.body. At this point, scroll values do not have the same impact on pageX/pageY.
		var stopCheckingScroll = false;
		
		while (n != null) {
			if (typeof(n.offsetLeft) == "number") {
				// The idea is to add offsetLeft/offsetTop, subtract scrollLeft/scrollTop, ignoring scroll values for elements in DOM tree levels 2 and higher.
				offsetLeft += n.offsetLeft; offsetTop += n.offsetTop;
				
				if (n == document.body || n == document.header) { stopCheckingScroll = true; }
				if (!stopCheckingScroll) { offsetLeft -= n.scrollLeft; offsetTop -= n.scrollTop; }
				
			} n = n.parentNode;
		}
		
		// By here, offsetLeft and offsetTop represent the "pageX/pageY" of the top-left corner of the div. So, do subtraction to find relative position.
		x = pageX - offsetLeft; y = pageY - offsetTop;
		
		x -= this.data.cy.pan().x; y -= this.data.cy.pan().y; x /= this.data.cy.zoom(); y /= this.data.cy.zoom();
		return [x, y];
	}
	
	CanvasRenderer.prototype.findContainerPageCoords = function() {
		var x, y; var offsetLeft = 0; var offsetTop = 0; var n; n = this.data.container;
		
		// Stop checking scroll past the level of the DOM tree containing document.body. At this point, scroll values do not have the same impact on pageX/pageY.
		var stopCheckingScroll = false;
		
		while (n != null) {
			if (typeof(n.offsetLeft) == "number") {
				// The idea is to add offsetLeft/offsetTop, subtract scrollLeft/scrollTop, ignoring scroll values for elements in DOM tree levels 2 and higher.
				offsetLeft += n.offsetLeft; offsetTop += n.offsetTop;
				
				if (n == document.body || n == document.header) { stopCheckingScroll = true; }
				if (!stopCheckingScroll) { offsetLeft -= n.scrollLeft; offsetTop -= n.scrollTop; }
				
			} n = n.parentNode;
		}
		
		// By here, offsetLeft and offsetTop represent the "pageX/pageY" of the top-left corner of the div.
		return [offsetLeft, offsetTop];
	}
	
	// Find nearest element
	CanvasRenderer.prototype.findNearestElement = function(x, y) {
		var data = this.data; var nodes = this.getCachedNodes(); var edges = this.getCachedEdges(); var near = [];
		
		// Check nodes
		for (var i = 0; i < nodes.length; i++) {
			if (nodeShapes[nodes[i]._private.style["shape"].value].checkPointRough(x, y,
					nodes[i]._private.style["border-width"].value,
					nodes[i]._private.style["width"].value, nodes[i]._private.style["height"].value,
					nodes[i]._private.position.x, nodes[i]._private.position.y)
				&&
				nodeShapes[nodes[i]._private.style["shape"].value].checkPoint(x, y,
					nodes[i]._private.style["border-width"].value,
					nodes[i]._private.style["width"].value / 2, nodes[i]._private.style["height"].value / 2,
					nodes[i]._private.position.x, nodes[i]._private.position.y)) {
				
				near.push(nodes[i]);
			}
		}
		
		// Check edges
		for (var i = 0; i < edges.length; i++) {
			if (edges[i]._private.rscratch.isSelfEdge) {
				if ((this.inBezierVicinity(x, y,
						edges[i]._private.rscratch.startX,
						edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.cp2ax,
						edges[i]._private.rscratch.cp2ay,
						edges[i]._private.rscratch.selfEdgeMidX,
						edges[i]._private.rscratch.selfEdgeMidY,
						Math.pow(edges[i]._private.style["width"].value / 2, 2))
							&&
					(Math.pow(edges[i]._private.style["width"].value / 2, 2) > 
						this.sqDistanceToQuadraticBezier(x, y,
							edges[i]._private.rscratch.startX,
							edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.cp2ax,
							edges[i]._private.rscratch.cp2ay,
							edges[i]._private.rscratch.selfEdgeMidX,
							edges[i]._private.rscratch.selfEdgeMidY)))
					||
					(this.inBezierVicinity(x, y,
						edges[i]._private.rscratch.startX,
						edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.cp2cx,
						edges[i]._private.rscratch.cp2cy,
						edges[i]._private.rscratch.selfEdgeMidX,
						edges[i]._private.rscratch.selfEdgeMidY,
						Math.pow(edges[i]._private.style["width"].value / 2, 2))
							&&
					(Math.pow(edges[i]._private.style["width"].value / 2, 2) > 
						this.sqDistanceToQuadraticBezier(x, y,
							edges[i]._private.rscratch.startX,
							edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.cp2cx,
							edges[i]._private.rscratch.cp2cy,
							edges[i]._private.rscratch.selfEdgeMidX,
							edges[i]._private.rscratch.selfEdgeMidY))))
					 { near.push(edges[i]); }
			} else if (edges[i]._private.rscratch.isStraightEdge) {
				if (Math.pow(edges[i]._private.style["width"].value / 2, 2) >
					this.sqDistanceToFiniteLine(x, y,
						edges[i]._private.rscratch.startX,
						edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.endX,
						edges[i]._private.rscratch.endY))
					{ near.push(edges[i]); }
			} else if (edges[i]._private.rscratch.isBezierEdge) {
				if (this.inBezierVicinity(x, y,
					edges[i]._private.rscratch.startX,
					edges[i]._private.rscratch.startY,
					edges[i]._private.cp2x, edges[i]._private.cp2y,
					edges[i]._private.rscratch.endX,
					edges[i]._private.rscratch.endY,
					Math.pow(edges[i]._private.style["width"].value / 2, 2))
						&&
					(Math.pow(edges[i]._private.style["width"].value / 2, 2) >
						this.sqDistanceToQuadraticBezier(x, y,
							edges[i]._private.rscratch.startX,
							edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.cp2x,
							edges[i]._private.rscratch.cp2y,
							edges[i]._private.rscratch.endX,
							edges[i]._private.rscratch.endY)))
					{ near.push(edges[i]); }
			}
			
			if (!near.length || near[near.length - 1] != edges[i]) {
				if ((arrowShapes[edges[i]._private.style["source-arrow-shape"].value].roughCollide(x, y,
						edges[i]._private.rscratch.arrowStartX, edges[i]._private.rscratch.arrowStartY,
						this.getArrowWidth(edges[i]._private.style["width"].value),
						this.getArrowHeight(edges[i]._private.style["width"].value),
						[edges[i]._private.rscratch.arrowStartX - edges[i].source()[0]._private.position.x,
							edges[i]._private.rscratch.arrowStartY - edges[i].source()[0]._private.position.y], 0)
						&&
					arrowShapes[edges[i]._private.style["source-arrow-shape"].value].collide(x, y,
						edges[i]._private.rscratch.arrowStartX, edges[i]._private.rscratch.arrowStartY,
						this.getArrowWidth(edges[i]._private.style["width"].value),
						this.getArrowHeight(edges[i]._private.style["width"].value),
						[edges[i]._private.rscratch.arrowStartX - edges[i].source()[0]._private.position.x,
							edges[i]._private.rscratch.arrowStartY - edges[i].source()[0]._private.position.y], 0))
					||
					(arrowShapes[edges[i]._private.style["target-arrow-shape"].value].roughCollide(x, y,
						edges[i]._private.rscratch.arrowEndX, edges[i]._private.rscratch.arrowEndY,
						this.getArrowWidth(edges[i]._private.style["width"].value),
						this.getArrowHeight(edges[i]._private.style["width"].value),
						[edges[i]._private.rscratch.arrowEndX - edges[i].target()[0]._private.position.x,
							edges[i]._private.rscratch.arrowEndY - edges[i].target()[0]._private.position.y], 0)
						&&
					arrowShapes[edges[i]._private.style["target-arrow-shape"].value].collide(x, y,
						edges[i]._private.rscratch.arrowEndX, edges[i]._private.rscratch.arrowEndY,
						this.getArrowWidth(edges[i]._private.style["width"].value),
						this.getArrowHeight(edges[i]._private.style["width"].value),
						[edges[i]._private.rscratch.arrowEndX - edges[i].target()[0]._private.position.x,
							edges[i]._private.rscratch.arrowEndY - edges[i].target()[0]._private.position.y], 0)))
					{ near.push(edges[i]); }
			}
		} 
		
		near.sort(function(a, b) {
		
			var zIndexCompare = b._private.style["z-index"].value - a._private.style["z-index"].value;
			// Reverse id order, same as given by cy.nodes()
			var idCompare = b._private.data.id.localeCompare(a._private.data.id);
			var nodeEdgeTypeCompare = (function(a, b){
				if (a.isEdge() && b.isNode()) {
					return 1;
				} else if (a.isNode() && b.isEdge()) {
					return -1;
				}
				
				return 0;
			})(a, b);
			
			return zIndexCompare || nodeEdgeTypeCompare || idCompare;
		});
		
		if (near.length > 0) { return near[0]; } else { return null; }
	}
	
	// "Give me everything from this box"
	CanvasRenderer.prototype.getAllInBox = function(x1, y1, x2, y2) {
		var data = this.data; var nodes = this.getCachedNodes(); var edges = this.getCachedEdges(); var box = [];
		
//		console.log(x1, y1, x2, y2, "e") 
		var x1c = Math.min(x1, x2); var x2c = Math.max(x1, x2); var y1c = Math.min(y1, y2); var y2c = Math.max(y1, y2); x1 = x1c; x2 = x2c; y1 = y1c; y2 = y2c; var heur;
//		console.log(x1, y1, x2, y2, "ec") 
		
		for (var i=0;i<nodes.length;i++) {
			if (nodeShapes[nodes[i]._private.style["shape"].value].intersectBox(x1, y1, x2, y2,
				nodes[i]._private.style["width"].value, nodes[i]._private.style["height"].value,
				nodes[i]._private.position.x, nodes[i]._private.position.y, nodes[i]._private.style["border-width"].value / 2))
			{ box.push(nodes[i]); }
		}
		
		for (var i=0;i<edges.length;i++) {
			if (edges[i]._private.rscratch.isSelfEdge) {
				if ((heur = this.boxInBezierVicinity(x1, y1, x2, y2,
						edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.cp2ax, edges[i]._private.rscratch.cp2ay,
						edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value))
							&&
						(heur == 2 || (heur == 1 && this.checkBezierCrossesBox(x1, y1, x2, y2,
							edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.cp2ax, edges[i]._private.rscratch.cp2ay,
							edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value)))
								||
					(heur = this.boxInBezierVicinity(x1, y1, x2, y2,
						edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.cp2cx, edges[i]._private.rscratch.cp2cy,
						edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value))
							&&
						(heur == 2 || (heur == 1 && this.checkBezierCrossesBox(x1, y1, x2, y2,
							edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.cp2cx, edges[i]._private.rscratch.cp2cy,
							edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value)))
					)
				{ box.push(edges[i]); }
			}
			
			if (edges[i]._private.rscratch.isBezierEdge &&
				(heur = this.boxInBezierVicinity(x1, y1, x2, y2,
						edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.cp2x, edges[i]._private.rscratch.cp2y,
						edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value))
							&&
						(heur == 2 || (heur == 1 && this.checkBezierCrossesBox(x1, y1, x2, y2,
							edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.cp2x, edges[i]._private.rscratch.cp2y,
							edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value))))
				{ box.push(edges[i]); }
		
			if (edges[i]._private.rscratch.isStraightEdge &&
				(heur = this.boxInBezierVicinity(x1, y1, x2, y2,
						edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
						edges[i]._private.rscratch.startX * 0.5 + edges[i]._private.rscratch.endX * 0.5, 
						edges[i]._private.rscratch.startY * 0.5 + edges[i]._private.rscratch.endY * 0.5, 
						edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value))
							&& /* console.log("test", heur) == undefined && */
						(heur == 2 || (heur == 1 && this.checkStraightEdgeCrossesBox(x1, y1, x2, y2,
							edges[i]._private.rscratch.startX, edges[i]._private.rscratch.startY,
							edges[i]._private.rscratch.endX, edges[i]._private.rscratch.endY, edges[i]._private.style["width"].value))))
				{ box.push(edges[i]); }
			
		}
		
		return box;
	}
	
	// @O Keyboard functions
	{
	}
	
	// @O Drawing functions
	{
	
	// Resize canvas
	CanvasRenderer.prototype.matchCanvasSize = function(container) {
		var data = this.data; var width = container.clientWidth; var height = container.clientHeight;
		
		var canvas;
		for (var i = 0; i < 5; i++) {
			
			canvas = data.canvases[i];
			
			if (canvas.width !== width || canvas.height !== height) {
				
				canvas.width = width;
				canvas.height = height;
			
			}
		}
		
		for (var i = 0; i < 2; i++) {
			
			canvas = data.banvases[i];
			
			if (canvas.width !== width || canvas.height !== height) {
				
				canvas.width = width;
				canvas.height = height;
				
			}
		}
	}
	
	// Redraw frame
	CanvasRenderer.prototype.redraw = function() {
		//console.log("redrawing");
		var cy = this.data.cy; var data = this.data; var nodes = this.getCachedNodes(); var edges = this.getCachedEdges();
		this.matchCanvasSize(data.container);
		
		var elements = nodes.add(edges).toArray();
		
		if (data.canvases[10+2] || data.canvases[10+4]) {
		
			this.findEdgeControlPoints(edges);
			
			elements.sort(function(a, b) {
				var result = a._private.style["z-index"].value
					- b._private.style["z-index"].value;
				
				if (result == 0) {
					if (a._private.group == "nodes"
						&& b._private.group == "edges") {
						
						return 1;
					} else if (a._private.group == "edges"
						&& b._private.group == "nodes") {
						
						return -1;
					}
				}
				
				return 0;
			});
		}
		
		if (data.canvases[10+4]) {
			var context = data.canvases[4].getContext("2d");

			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, context.canvas.width, context.canvas.height);
			
			context.translate(cy.pan().x, cy.pan().y);
			context.scale(cy.zoom(), cy.zoom());
		
			var element;
			
			for (var index = 0; index < elements.length; index++) {
				element = elements[index];
				
				if (!element._private.grabbed) {
					if (element._private.group == "nodes") {
						this.drawNode(context, element);
						
					} else if (element._private.group == "edges") {
						this.drawEdge(context, element);
					}
				}
			}
			
			for (var index = 0; index < elements.length; index++) {
				element = elements[index];
				
				if (!element._private.grabbed) {
					if (element._private.group == "nodes") {
						this.drawNodeText(context, element);
					} else if (element._private.group == "edges") {
						this.drawEdgeText(context, element);
					}
				}
			}
			
			data.canvases[10+4] = false; data.canvases[5+4] = [];
		}
		
		if (data.canvases[10+2]) {
			var context = data.canvases[2].getContext("2d");
			
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, context.canvas.width, context.canvas.height);
			
			context.translate(cy.pan().x, cy.pan().y);
			context.scale(cy.zoom(), cy.zoom());
			
			var element;

			for (var index = 0; index < elements.length; index++) {
				element = elements[index];
				
				if (element._private.grabbed) {
					if (element._private.group == "nodes") {
						this.drawNode(context, element);
					} else if (element._private.group == "edges") {
						this.drawEdge(context, element);
					}
				}
			}
			
			for (var index = 0; index < elements.length; index++) {
				element = elements[index];
				
				if (element._private.grabbed) {
					if (element._private.group == "nodes") {
						this.drawNodeText(context, element);
					} else if (element._private.group == "edges") {
						this.drawEdgeText(context, element);
					}
				}
			}
			
			data.canvases[10+2] = false; data.canvases[5+2] = [];
		}
		
		if (data.canvases[10+0]) {
			var context = data.canvases[0].getContext("2d");
			
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, context.canvas.width, context.canvas.height);
		
			context.translate(cy.pan().x, cy.pan().y);
			context.scale(cy.zoom(), cy.zoom());			
			
			if (data.select[4] == 1) {
				var coreStyle = cy.style()._private.coreStyle;
				var borderWidth = coreStyle["selection-box-border-width"].value
					/ data.cy.zoom();
				
				context.lineWidth = borderWidth;
				context.fillStyle = "rgba(" 
					+ coreStyle["selection-box-color"].value[0] + ","
					+ coreStyle["selection-box-color"].value[1] + ","
					+ coreStyle["selection-box-color"].value[2] + ","
					+ coreStyle["selection-box-opacity"].value + ")";
				
				context.fillRect(
					data.select[0],
					data.select[1],
					data.select[2] - data.select[0],
					data.select[3] - data.select[1]);
				
				if (borderWidth > 0) {
					context.strokeStyle = "rgba(" 
						+ coreStyle["selection-box-border-color"].value[0] + ","
						+ coreStyle["selection-box-border-color"].value[1] + ","
						+ coreStyle["selection-box-border-color"].value[2] + ","
						+ coreStyle["selection-box-opacity"].value + ")";
					
					context.strokeRect(
						data.select[0],
						data.select[1],
						data.select[2] - data.select[0],
						data.select[3] - data.select[1]);
				}
			}
			
			data.canvases[10+0] = false; data.canvases[5+0] = [];
		}

		{
			var context;
					
			// Rasterize the layers
			context = data.banvases[1].getContext("2d");
			context.globalCompositeOperation = "copy";
			context.drawImage(data.canvases[4], 0, 0);
			context.globalCompositeOperation = "source-over";
			context.drawImage(data.canvases[2], 0, 0);
			context.drawImage(data.canvases[0], 0, 0);
//			context.fillStyle = "rgba(0,0,0,1)";
//			context.fillRect(50, 50, 400, 400);
			
			context = data.banvases[0].getContext("2d");
			context.globalCompositeOperation = "copy";
			context.drawImage(data.banvases[1], 0, 0);
//			context.fillStyle = "rgba(0,0,0,1)";
//			context.fillRect(50, 50, 400, 400);
		}
		
		/*
		{
			var image = new Image();
			image.src = "http://st73.storage.gree.jp/album/23/42/27952342/4004d74b_640.jpg";
			
			var context = data.banvases[0].getContext("2d");
			context.drawImage(image, 0, 0);
		}
		*/
	};
	
	var imageCache = {};
	
	/*
	{
		var url, image;
		
		if (imageCache[url] == undefined) {	imageCache[url] = image; }
	}
	*/
	
	CanvasRenderer.prototype.getCachedImage = function(url) {
		
		var image = imageCache[url];
		
		if (image == undefined) { imageCache[url] = new Image(); imageCache[url].src = url; image = imageCache[url]; }
		
		return image;
	}
	
	CanvasRenderer.prototype.drawImage = function(context, x, y, widthScale, heightScale, rotationCW, image) {
		
		image.widthScale = 0.5;
		image.heightScale = 0.5;
		
		image.rotate = rotationCW;
		
		var finalWidth; var finalHeight;
		
		canvas.drawImage(image, x, y);
	}
	
	// Draw edge
	CanvasRenderer.prototype.drawEdge = function(context, edge) {
	
		var startNode, endNode;

		startNode = edge.source()[0];
		endNode = edge.target()[0];
		
		if (edge._private.style["visibility"].value != "visible"
			|| startNode._private.style["visibility"].value != "visible"
			|| endNode._private.style["visibility"].value != "visible") {
			return;
		}
		
		// Edge color & opacity
		context.strokeStyle = "rgba(" 
			+ edge._private.style["line-color"].value[0] + ","
			+ edge._private.style["line-color"].value[1] + ","
			+ edge._private.style["line-color"].value[2] + ","
			+ edge._private.style.opacity.value + ")";
		
		// Edge line width
		if (edge._private.style["width"].value <= 0) {
			return;
		}
		
		context.lineWidth = edge._private.style["width"].value;
		
		this.findEndpoints(edge);
		
		if (edge._private.rscratch.isSelfEdge) {
		
			/*
			context.beginPath();
			context.moveTo(
				edge._private.rscratch.startX,
				edge._private.rscratch.startY)
			
			context.quadraticCurveTo(
				edge._private.rscratch.cp2ax,
				edge._private.rscratch.cp2ay,
				edge._private.rscratch.selfEdgeMidX,
				edge._private.rscratch.selfEdgeMidY);
			
			context.moveTo(
				edge._private.rscratch.selfEdgeMidX,
				edge._private.rscratch.selfEdgeMidY);
			
			context.quadraticCurveTo(
				edge._private.rscratch.cp2cx,
				edge._private.rscratch.cp2cy,
				edge._private.rscratch.endX,
				edge._private.rscratch.endY);
			
			context.stroke();
			*/
			
			var details = edge._private.rscratch;
			this.drawBezierEdge(context, details.startX, details.startY, details.cp2ax,
				details.cp2ay, details.selfEdgeMidX, details.selfEdgeMidY,
				edge._private.style["line-style"].value,
				edge._private.style["width"].value);
			
			this.drawBezierEdge(context, details.selfEdgeMidX, details.selfEdgeMidY,
				details.cp2cx, details.cp2cy, details.endX, details.endY,
				edge._private.style["line-style"].value,
				edge._private.style["width"].value);
			
		} else if (edge._private.rscratch.isStraightEdge) {
			
			// Check if the edge is inverted due to close node proximity
			var nodeDirectionX = endNode._private.position.x - startNode._private.position.x;
			var nodeDirectionY = endNode._private.position.y - startNode._private.position.y;
			
			var edgeDirectionX = edge._private.rscratch.endX - edge._private.rscratch.startX;
			var edgeDirectionY = edge._private.rscratch.endY - edge._private.rscratch.startY;
			
			if (nodeDirectionX * edgeDirectionX
				+ nodeDirectionY * edgeDirectionY < 0) {
				
				edge._private.rscratch.straightEdgeTooShort = true;	
			} else {
				context.beginPath();
				context.moveTo(
					edge._private.rscratch.startX,
					edge._private.rscratch.startY);
	
				context.lineTo(edge._private.rscratch.endX, 
					edge._private.rscratch.endY);
				context.stroke();
				
				edge._private.rscratch.straightEdgeTooShort = false;	
			}	
		} else {
			
			/*
			context.beginPath();
			context.moveTo(
				edge._private.rscratch.startX,
				edge._private.rscratch.startY);
			
			context.quadraticCurveTo(
				edge._private.rscratch.cp2x, 
				edge._private.rscratch.cp2y, 
				edge._private.rscratch.endX, 
				edge._private.rscratch.endY);
			context.stroke();
			*/
			
			var details = edge._private.rscratch;
			this.drawBezierEdge(context, details.startX, details.startY,
				details.cp2x, details.cp2y, details.endX, details.endY,
				edge._private.style["line-style"].value,
				edge._private.style["width"].value);
			
		}
		
		if (edge._private.rscratch.noArrowPlacement !== true
				&& edge._private.rscratch.startX !== undefined) {
			this.drawArrowheads(context, edge);
		}
	}
	
	var _genpoints = function(pt, spacing, even) {
		
		var approxLen = Math.sqrt(Math.pow(pt[4] - pt[0], 2) + Math.pow(pt[5] - pt[1], 2));
		approxLen += Math.sqrt(Math.pow((pt[4] + pt[0]) / 2 - pt[2], 2) + Math.pow((pt[5] + pt[1]) / 2 - pt[3], 2));

		var pts = Math.ceil(approxLen / spacing); var inc = approxLen / spacing;
		
		var pz = new Array(pts);
		
		for (var i = 0; i < pts; i++) {
			var cur = i / pts;
			pz[i * 2] = pt[0] * (1 - cur) * (1 - cur) + 2 * (pt[2]) * (1 - cur) * cur + pt[4] * (cur) * (cur);
			pz[i * 2 + 1] = pt[1] * (1 - cur) * (1 - cur) + 2 * (pt[3]) * (1 - cur) * cur + pt[5] * (cur) * (cur);
		}
		
		return pz;
	}
	
	var _genevenoddpts = function(pt, evenspac, oddspac) {
		
		pt1 = _genpts(pt, evenspac);
		pt2 = _genpts(pt, oddspac);
		
	}
	
	CanvasRenderer.prototype.createBuffer = function(size) {
		var buffer = document.createElement("canvas");
		buffer.width = size;
		buffer.height = size;
		
		return [buffer, buffer.getContext("2d")];
	}
	
	CanvasRenderer.prototype.drawBezierEdge = function(context, x1, y1, cp1x, cp1y, x2, y2, type, width) {
		
		/*
		var renderToCanvas = function (width, height, renderFunction) {
			var buffer = document.createElement('canvas');
			buffer.width = width;
			buffer.height = height;
	
			renderFunction(buffer.getContext('2d'));
			return buffer;
		};
		*/
		
		
		if (type == "dotted2") {
			var pt = _genpoints([x1, y1, cp1x, cp1y, x2, y2], 5, true);
			
			var buffer = this.createBuffer(width);
			var context2 = buffer[1];
			
			context2.setTransform(1, 0, 0, 1, 0, 0);
			context2.clearRect(0, 0, buffer[0].width, buffer[0].height);
			
			// Draw on buffer
			context2.beginPath();
			context2.arc(width/2, width/2, width/2, 0, Math.PI * 2);
			//context2.fill();
			
			// Now use buffer
			//context.beginPath();
			var halfWidth = width/2;
			for (var i=0;i<pt.length/2;i++) {
				context.drawImage(buffer[0], pt[i*2] - halfWidth, pt[i*2+1] - halfWidth)
				
				//context.arc(pt[i * 2], pt[i * 2 + 1], 1, 0, Math.PI * 2);
				//context.closePath();
				//context.fill();
			}
			
			
		} else if (type == "dashed") {
			var pt = _genpoints([x1, y1, cp1x, cp1y, x2, y2], 5, true);
			
			context.beginPath();
			for (var i=0;i<pt.length/4;i++) {
				context.moveTo(pt[i * 4], pt[i * 4 + 1]);
				context.lineTo(pt[i * 4 + 2], pt[i * 4 + 3]);
			}
			//context.closePath();
			context.stroke();
		} else {
			context.beginPath();
			context.moveTo(x1, y1);
			context.quadraticCurveTo(cp1x, cp1y, x2, y2);
//			context.closePath();
			context.stroke();
		}
		
	}
	
	// Draw edge text
	CanvasRenderer.prototype.drawEdgeText = function(context, edge) {
	
		if (edge._private.style["visibility"].value != "visible") {
			return;
		}
	
		// Calculate text draw position
		
		context.textAlign = "center";
		context.textBaseline = "middle";
		
		var textX, textY;	
		var edgeCenterX, edgeCenterY;
		
		if (edge._private.rscratch.isSelfEdge) {
			edgeCenterX = edge._private.rscratch.selfEdgeMidX;
			edgeCenterY = edge._private.rscratch.selfEdgeMidY;
		} else if (edge._private.rscratch.isStraightEdge) {
			edgeCenterX = (edge._private.rscratch.startX
				+ edge._private.rscratch.endX) / 2;
			edgeCenterY = (edge._private.rscratch.startY
				+ edge._private.rscratch.endY) / 2;
		} else if (edge._private.rscratch.isBezierEdge) {
			edgeCenterX = Math.pow(1 - 0.5, 2) * edge._private.rscratch.startX
				+ 2 * (1 - 0.5) * 0.5 * edge._private.rscratch.cp2x
				+ (0.5 * 0.5) * edge._private.rscratch.endX;
			
			edgeCenterY = Math.pow(1 - 0.5, 2) * edge._private.rscratch.startY
				+ 2 * (1 - 0.5) * 0.5 * edge._private.rscratch.cp2y
				+ (0.5 * 0.5) * edge._private.rscratch.endY;
		}
		
		textX = edgeCenterX;
		textY = edgeCenterY;
		
		this.drawText(context, edge, textX, textY);
	}
	
	// Draw node
	CanvasRenderer.prototype.drawNode = function(context, node) {
	
		var nodeWidth, nodeHeight;
		
		if (node._private.style["visibility"].value != "visible") {
			return;
		}
		
		// Node color & opacity
		context.fillStyle = "rgba(" 
			+ node._private.style["background-color"].value[0] + ","
			+ node._private.style["background-color"].value[1] + ","
			+ node._private.style["background-color"].value[2] + ","
			+ (node._private.style["background-opacity"].value 
			* node._private.style["opacity"].value) + ")";
		
		// Node border color & opacity
		context.strokeStyle = "rgba(" 
			+ node._private.style["border-color"].value[0] + ","
			+ node._private.style["border-color"].value[1] + ","
			+ node._private.style["border-color"].value[2] + ","
			+ (node._private.style["border-opacity"].value 
			* node._private.style["opacity"].value) + ")";
		
		nodeWidth = node._private.style["width"].value;
		nodeHeight = node._private.style["height"].value;
		
		{
			//var image = this.getCachedImage("url");
			
			if (node._private.style["background-image"].value[1]) {
				
				//context.clip
				
			} else {
				// Draw node
				nodeShapes[node._private.style["shape"].value].draw(
					context,
					node,
					nodeWidth,
					nodeHeight); //node._private.data.weight / 5.0
			}
			/*
			context.drawImage(image, 
			*/
		}
		
		// Border width, draw border
		context.lineWidth = node._private.style["border-width"].value;
		if (node._private.style["border-width"].value > 0) {
			context.stroke();
		}
	}
	
	// Draw node text
	CanvasRenderer.prototype.drawNodeText = function(context, node) {
		
		if (node._private.style["visibility"].value != "visible") {
			return;
		}
	
		var textX, textY;
		
		var nodeWidth = node._private.style["width"].value;
		var nodeHeight = node._private.style["height"].value;
	
		// Find text position
		var textHalign = node._private.style["text-halign"].strValue;
		if (textHalign == "left") {
			// Align right boundary of text with left boundary of node
			context.textAlign = "right";
			textX = node._private.position.x - nodeWidth / 2;
		} else if (textHalign == "right") {
			// Align left boundary of text with right boundary of node
			context.textAlign = "left";
			textX = node._private.position.x + nodeWidth / 2;
		} else if (textHalign == "center") {
			context.textAlign = "center";
			textX = node._private.position.x;
		} else {
			// Same as center
			context.textAlign = "center";
			textX = node._private.position.x;
		}
		
		var textValign = node._private.style["text-valign"].strValue;
		if (textValign == "top") {
			context.textBaseline = "bottom";
			textY = node._private.position.y - nodeHeight / 2;
		} else if (textValign == "bottom") {
			context.textBaseline = "top";
			textY = node._private.position.y + nodeHeight / 2;
		} else if (textValign == "middle" || textValign == "center") {
			context.textBaseline = "middle";
			textY = node._private.position.y;
		} else {
			// same as center
			context.textBaseline = "middle";
			textY = node._private.position.y;
		}
		
		this.drawText(context, node, textX, textY);
	}
	
	// Draw text
	CanvasRenderer.prototype.drawText = function(context, element, textX, textY) {
	
		// Font style
		var labelStyle = element._private.style["font-style"].strValue;
		var labelSize = element._private.style["font-size"].strValue;
		var labelFamily = element._private.style["font-family"].strValue;
		var labelVariant = element._private.style["font-variant"].strValue;
		var labelWeight = element._private.style["font-weight"].strValue;
					
		context.font = labelStyle + " " + labelVariant + " " + labelWeight + " " 
			+ labelSize + " " + labelFamily;
					
		var text = String(element._private.style["content"].value);
		var textTransform = element._private.style["text-transform"].value;
		
		if (textTransform == "none") {
		} else if (textTransform == "uppercase") {
			text = text.toUpperCase();
		} else if (textTransform == "lowercase") {
			text = text.toLowerCase();
		}
		
		// Calculate text draw position based on text alignment
		
		context.fillStyle = "rgba(" 
			+ element._private.style["color"].value[0] + ","
			+ element._private.style["color"].value[1] + ","
			+ element._private.style["color"].value[2] + ","
			+ (element._private.style["text-opacity"].value
			* element._private.style["opacity"].value) + ")";
		
		context.strokeStyle = "rgba(" 
			+ element._private.style["text-outline-color"].value[0] + ","
			+ element._private.style["text-outline-color"].value[1] + ","
			+ element._private.style["text-outline-color"].value[2] + ","
			+ (element._private.style["text-opacity"].value
			* element._private.style["opacity"].value) + ")";
		
		if (text != undefined) {
			// Thanks sysord@github for the isNaN checks!
			if (isNaN(textX)) { textX = 0; }
			if (isNaN(textY)) { textY = 0; }

			context.fillText("" + text, textX, textY);
		}
		
		var lineWidth = element._private.style["text-outline-width"].value;
		
		if (lineWidth > 0) {
			context.lineWidth = lineWidth;
			context.strokeText(text, textX, textY);
		}
	}

	}
	
	// @O Edge calculation functions
	{
	
	// Find edge control points
	CanvasRenderer.prototype.findEdgeControlPoints = function(edges) {
		var hashTable = {}; var cy = this.data.cy;
		
		var pairId;
		for (var i = 0; i < edges.length; i++) {
			pairId = edges[i]._private.data.source > edges[i]._private.data.target ?
				edges[i]._private.data.target + edges[i]._private.data.source :
				edges[i]._private.data.source + edges[i]._private.data.target;

			if (hashTable[pairId] == undefined) {
				hashTable[pairId] = [];
			}
			
			hashTable[pairId].push(edges[i]);
		}
		var src, tgt;
		
		// Nested for loop is OK; total number of iterations for both loops = edgeCount	
		for (var pairId in hashTable) {
		
			src = cy.getElementById(hashTable[pairId][0]._private.data.source);
			tgt = cy.getElementById(hashTable[pairId][0]._private.data.target);

			var midPointX = (src._private.position.x + tgt._private.position.x) / 2;
			var midPointY = (src._private.position.y + tgt._private.position.y) / 2;
			
			var displacementX, displacementY;
			
			if (hashTable[pairId].length > 1) {
				displacementX = tgt._private.position.y - src._private.position.y;
				displacementY = src._private.position.x - tgt._private.position.x;
				
				var displacementLength = Math.sqrt(displacementX * displacementX
					+ displacementY * displacementY);
				
				displacementX /= displacementLength;
				displacementY /= displacementLength;
			}
			
			var edge;
			
			for (var i = 0; i < hashTable[pairId].length; i++) {
				edge = hashTable[pairId][i];
							
				// Self-edge
				if (src._private.data.id == tgt._private.data.id) {
					var stepSize = edge._private.style["control-point-step-size"].pxValue;
						
					edge._private.rscratch.isSelfEdge = true;
					
					edge._private.rscratch.cp2ax = src._private.position.x;
					edge._private.rscratch.cp2ay = src._private.position.y
						- 1.3 * stepSize * (i / 3 + 1);
					
					edge._private.rscratch.cp2cx = src._private.position.x
						- 1.3 * stepSize * (i / 3 + 1);
					edge._private.rscratch.cp2cy = src._private.position.y;
					
					edge._private.rscratch.selfEdgeMidX =
						(edge._private.rscratch.cp2ax + edge._private.rscratch.cp2cx) / 2.0;
				
					edge._private.rscratch.selfEdgeMidY =
						(edge._private.rscratch.cp2ay + edge._private.rscratch.cp2cy) / 2.0;
						
				// Straight edge	
				} else if (hashTable[pairId].length % 2 == 1
					&& i == Math.floor(hashTable[pairId].length / 2)) {
					
					edge._private.rscratch.isStraightEdge = true;
					
				// Bezier edge
				} else {
					var stepSize = edge._private.style["control-point-step-size"].value;
					var distanceFromMidpoint = (0.5 - hashTable[pairId].length / 2 + i) * stepSize;
					
					edge._private.rscratch.isBezierEdge = true;
					
					edge._private.rscratch.cp2x = midPointX
						+ displacementX * distanceFromMidpoint;
					edge._private.rscratch.cp2y = midPointY
						+ displacementY * distanceFromMidpoint;
					
					// console.log(edge, midPointX, displacementX, distanceFromMidpoint);
				}
			}
		}
		
		return hashTable;
	}

	CanvasRenderer.prototype.findEndpoints = function(edge) {
		var intersect;

		var source = edge.source()[0];
		var target = edge.target()[0];
		
		var sourceRadius = Math.max(edge.source()[0]._private.style["width"].value,
			edge.source()[0]._private.style["height"].value);
		
		var targetRadius = Math.max(edge.target()[0]._private.style["width"].value,
			edge.target()[0]._private.style["height"].value);
		
		sourceRadius = 0;
		targetRadius /= 2;
		
		var start = [edge.source().position().x, edge.source().position().y];
		var end = [edge.target().position().x, edge.target().position().y];
		
		if (edge._private.rscratch.isSelfEdge) {
			
			var cp = [edge._private.rscratch.cp2cx, edge._private.rscratch.cp2cy];
			
			intersect = nodeShapes[target._private.style["shape"].value].intersectLine(
				target,
				target._private.style["width"].value,
				target._private.style["height"].value,
				cp[0], //halfPointX,
				cp[1] //halfPointY
			);
			
			var arrowEnd = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["target-arrow-shape"].value].spacing(edge));
			var edgeEnd = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["target-arrow-shape"].value].gap(edge));
			
			edge._private.rscratch.endX = edgeEnd[0];
			edge._private.rscratch.endY = edgeEnd[1];
			
			edge._private.rscratch.arrowEndX = arrowEnd[0];
			edge._private.rscratch.arrowEndY = arrowEnd[1];
			
			var cp = [edge._private.rscratch.cp2ax, edge._private.rscratch.cp2ay];

			intersect = nodeShapes[source._private.style["shape"].value].intersectLine(
				source,
				source._private.style["width"].value,
				source._private.style["height"].value,
				cp[0], //halfPointX,
				cp[1] //halfPointY
			);
			
			var arrowStart = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["source-arrow-shape"].value].spacing(edge));
			var edgeStart = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["source-arrow-shape"].value].gap(edge));
			
			edge._private.rscratch.startX = edgeStart[0];
			edge._private.rscratch.startY = edgeStart[1];
			
			edge._private.rscratch.arrowStartX = arrowStart[0];
			edge._private.rscratch.arrowStartY = arrowStart[1];
			
		} else if (edge._private.rscratch.isStraightEdge) {
		
			
			intersect = nodeShapes[target._private.style["shape"].value].intersectLine(
				target,
				target._private.style["width"].value,
				target._private.style["height"].value,
				source.position().x,
				source.position().y);
				
			if (intersect.length == 0) {
				edge._private.rscratch.noArrowPlacement = true;
	//			return;
			} else {
				edge._private.rscratch.noArrowPlacement = false;
			}
			
			var arrowEnd = this.shortenIntersection(intersect,
				[source.position().x, source.position().y],
				arrowShapes[edge._private.style["target-arrow-shape"].value].spacing(edge));
			var edgeEnd = this.shortenIntersection(intersect,
				[source.position().x, source.position().y],
				arrowShapes[edge._private.style["target-arrow-shape"].value].gap(edge));

			edge._private.rscratch.endX = edgeEnd[0];
			edge._private.rscratch.endY = edgeEnd[1];
			
			edge._private.rscratch.arrowEndX = arrowEnd[0];
			edge._private.rscratch.arrowEndY = arrowEnd[1];
		
			intersect = nodeShapes[source._private.style["shape"].value].intersectLine(
				source,
				source._private.style["width"].value,
				source._private.style["height"].value,
				target.position().x,
				target.position().y);
			
			if (intersect.length == 0) {
				edge._private.rscratch.noArrowPlacement = true;
	//			return;
			} else {
				edge._private.rscratch.noArrowPlacement = false;
			}
			
			/*
			console.log("1: "
				+ arrowShapes[edge._private.style["source-arrow-shape"].value],
					edge._private.style["source-arrow-shape"].value);
			*/
			var arrowStart = this.shortenIntersection(intersect,
				[target.position().x, target.position().y],
				arrowShapes[edge._private.style["source-arrow-shape"].value].spacing(edge));
			var edgeStart = this.shortenIntersection(intersect,
				[target.position().x, target.position().y],
				arrowShapes[edge._private.style["source-arrow-shape"].value].gap(edge));

			edge._private.rscratch.startX = edgeStart[0];
			edge._private.rscratch.startY = edgeStart[1];
			
			edge._private.rscratch.arrowStartX = arrowStart[0];
			edge._private.rscratch.arrowStartY = arrowStart[1];
						
		} else if (edge._private.rscratch.isBezierEdge) {
			
			var cp = [edge._private.rscratch.cp2x, edge._private.rscratch.cp2y];
			
			// Point at middle of Bezier
			var halfPointX = start[0] * 0.25 + end[0] * 0.25 + cp[0] * 0.5;
			var halfPointY = start[1] * 0.25 + end[1] * 0.25 + cp[1] * 0.5;
			
			intersect = nodeShapes[
				target._private.style["shape"].value].intersectLine(
				target,
				target._private.style["width"].value,
				target._private.style["height"].value,
				cp[0], //halfPointX,
				cp[1] //halfPointY
			);
			
			/*
			console.log("2: "
				+ arrowShapes[edge._private.style["source-arrow-shape"].value],
					edge._private.style["source-arrow-shape"].value);
			*/
			var arrowEnd = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["target-arrow-shape"].value].spacing(edge));
			var edgeEnd = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["target-arrow-shape"].value].gap(edge));
			
			edge._private.rscratch.endX = edgeEnd[0];
			edge._private.rscratch.endY = edgeEnd[1];
			
			edge._private.rscratch.arrowEndX = arrowEnd[0];
			edge._private.rscratch.arrowEndY = arrowEnd[1];
			
			intersect = nodeShapes[
				source._private.style["shape"].value].intersectLine(
				source,
				source._private.style["width"].value,
				source._private.style["height"].value,
				cp[0], //halfPointX,
				cp[1] //halfPointY
			);
			
			var arrowStart = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["source-arrow-shape"].value].spacing(edge));
			var edgeStart = this.shortenIntersection(intersect, cp,
				arrowShapes[edge._private.style["source-arrow-shape"].value].gap(edge));
			
			edge._private.rscratch.startX = edgeStart[0];
			edge._private.rscratch.startY = edgeStart[1];
			
			edge._private.rscratch.arrowStartX = arrowStart[0];
			edge._private.rscratch.arrowStartY = arrowStart[1];
			
		} else if (edge._private.rscratch.isArcEdge) {
			return;
		}
	}

	}

	// @O Graph traversal functions
	{
	
	// Find adjacent edges
	CanvasRenderer.prototype.findEdges = function(nodeSet) {
		
		var edges = this.getCachedEdges();
		
		var hashTable = {};
		var adjacentEdges = [];
		
		for (var i = 0; i < nodeSet.length; i++) {
			hashTable[nodeSet[i]._private.data.id] = nodeSet[i];
		}
		
		for (var i = 0; i < edges.length; i++) {
			if (hashTable[edges[i]._private.data.source]
				|| hashTable[edges[i]._private.data.target]) {
				
				adjacentEdges.push(edges[i]);
			}
		}
		
		return adjacentEdges;
	}
	
	}
	
	// @O Intersection functions
	{
	CanvasRenderer.prototype.intersectLineEllipse = function(
		x, y, centerX, centerY, ellipseWradius, ellipseHradius) {
		
		var dispX = centerX - x;
		var dispY = centerY - y;
		
		dispX /= ellipseWradius;
		dispY /= ellipseHradius;
		
		var len = Math.sqrt(dispX * dispX + dispY * dispY);
		
		var newLength = len - 1;
		
		if (newLength < 0) {
			return [];
		}
		
		var lenProportion = newLength / len;
		
		return [(centerX - x) * lenProportion + x, (centerY - y) * lenProportion + y];
	}
	
	CanvasRenderer.prototype.findCircleNearPoint = function(centerX, centerY, 
		radius, farX, farY) {
		
		var displacementX = farX - centerX;
		var displacementY = farY - centerY;
		var distance = Math.sqrt(displacementX * displacementX 
			+ displacementY * displacementY);
		
		var unitDisplacementX = displacementX / distance;
		var unitDisplacementY = displacementY / distance;
		
		return [centerX + unitDisplacementX * radius, 
			centerY + unitDisplacementY * radius];
	}
	
	CanvasRenderer.prototype.findMaxSqDistanceToOrigin = function(points) {
		var maxSqDistance = 0.000001;
		var sqDistance;
		
		for (var i = 0; i < points.length / 2; i++) {
			
			sqDistance = points[i * 2] * points[i * 2] 
				+ points[i * 2 + 1] * points[i * 2 + 1];
			
			if (sqDistance > maxSqDistance) {
				maxSqDistance = sqDistance;
			}
		}
		
		return maxSqDistance;
	}
	
	CanvasRenderer.prototype.finiteLinesIntersect = function(
		x1, y1, x2, y2, x3, y3, x4, y4, infiniteLines) {
		
		var ua_t = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
		var ub_t = (x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3);
		var u_b = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

		if (u_b != 0) {
			var ua = ua_t / u_b;
			var ub = ub_t / u_b;
			
			if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {	
				return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
				
			} else {
				if (!infiniteLines) {
					return [];
				} else {
					return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
				}
			}
		} else {
			if (ua_t == 0 || ub_t == 0) {

				// Parallel, coincident lines. Check if overlap

				// Check endpoint of second line
				if ([x1, x2, x4].sort()[1] == x4) {
					return [x4, y4];
				}
				
				// Check start point of second line
				if ([x1, x2, x3].sort()[1] == x3) {
					return [x3, y3];
				}
				
				// Endpoint of first line
				if ([x3, x4, x2].sort()[1] == x2) {
					return [x2, y2];
				}
				
				return [];
			} else {
			
				// Parallel, non-coincident
				return [];
			}
		}
	}
	
	CanvasRenderer.prototype.boxIntersectEllipse = function(
		x1, y1, x2, y2, padding, width, height, centerX, centerY) {
		
		if (x2 < x1) {
			var oldX1 = x1;
			x1 = x2;
			x2 = oldX1;
		}
		
		if (y2 < y1) {
			var oldY1 = y1;
			y1 = y2;
			y2 = oldY1;
		}
		
		// 4 ortho extreme points
		var east = [centerX - width / 2 - padding, centerY];
		var west = [centerX + width / 2 + padding, centerY];
		var north = [centerX, centerY + height / 2 + padding];
		var south = [centerX, centerY - height / 2 - padding];
		
		// out of bounds: return false
		if (x2 < east[0]) {
			return false;
		}
		
		if (x1 > west[0]) {
			return false;
		}
		
		if (y2 < south[1]) {
			return false;
		}
		
		if (y1 > north[1]) {
			return false;
		}
		
		// 1 of 4 ortho extreme points in box: return true
		if (x1 <= east[0] && east[0] <= x2
				&& y1 <= east[1] && east[1] <= y2) {
			return true;
		}
		
		if (x1 <= west[0] && west[0] <= x2
				&& y1 <= west[1] && west[1] <= y2) {
			return true;
		}
		
		if (x1 <= north[0] && north[0] <= x2
				&& y1 <= north[1] && north[1] <= y2) {
			return true;
		}
		
		if (x1 <= south[0] && south[0] <= x2
				&& y1 <= south[1] && south[1] <= y2) {
			return true;
		}
		
		// box corner in ellipse: return true		
		x1 = (x1 - centerX) / (width + padding);
		x2 = (x2 - centerX) / (width + padding);
		
		y1 = (y1 - centerY) / (height + padding);
		y2 = (y2 - centerY) / (height + padding);
		
		if (x1 * x1 + y1 * y1 <= 1) {
			return true;
		}
		
		if (x2 * x2 + y1 * y1 <= 1) {
			return true;
		}
		
		if (x2 * x2 + y2 * y2 <= 1) {
			return true;
		}
		
		if (x1 * x1 + y2 * y2 <= 1) {
			return true;
		}
		
		return false;
	}
	
	CanvasRenderer.prototype.boxIntersectPolygon = function(
		x1, y1, x2, y2, basePoints, width, height, centerX, centerY, direction, padding) {
		
//		console.log(arguments);
		
		if (x2 < x1) {
			var oldX1 = x1;
			x1 = x2;
			x2 = oldX1;
		}
		
		if (y2 < y1) {
			var oldY1 = y1;
			y1 = y2;
			y2 = oldY1;
		}
		
		var transformedPoints = new Array(basePoints.length)
		
		// Gives negative of angle
		var angle = Math.asin(direction[1] / (Math.sqrt(direction[0] * direction[0] 
			+ direction[1] * direction[1])));
		
		if (direction[0] < 0) {
			angle = angle + Math.PI / 2;
		} else {
			angle = -angle - Math.PI / 2;
		}
		
		var cos = Math.cos(-angle);
		var sin = Math.sin(-angle);
		
		for (var i = 0; i < transformedPoints.length / 2; i++) {
			transformedPoints[i * 2] = 
				width * (basePoints[i * 2] * cos
					- basePoints[i * 2 + 1] * sin);
			
			transformedPoints[i * 2 + 1] = 
				height * (basePoints[i * 2 + 1] * cos 
					+ basePoints[i * 2] * sin);
			
			transformedPoints[i * 2] += centerX;
			transformedPoints[i * 2 + 1] += centerY;
		}
		
		var points;
		
		if (padding > 0) {
			var expandedLineSet = renderer.expandPolygon(
				transformedPoints,
				-padding);
			
			points = renderer.joinLines(expandedLineSet);
		} else {
			points = transformedPoints;
		}
		
		// Check if a point is in box
		for (var i = 0; i < transformedPoints.length / 2; i++) {
			if (x1 <= transformedPoints[i * 2]
					&& transformedPoints[i * 2] <= x2) {
				
				if (y1 <= transformedPoints[i * 2 + 1]
						&& transformedPoints[i * 2 + 1] <= y2) {
					
					return true;
				}
			}
		}
		
		// Check if box corner in the polygon
		if (renderer.pointInsidePolygon(
			x1, y1, points, 0, 0, 1, 1, 0, direction)) {
			
			return true;
		} else if (renderer.pointInsidePolygon(
			x1, y2, points, 0, 0, 1, 1, 0, direction)) {
			
			return true;
		} else if (renderer.pointInsidePolygon(
			x2, y2, points, 0, 0, 1, 1, 0, direction)) {
			
			return true;
		} else if (renderer.pointInsidePolygon(
			x2, y1, points, 0, 0, 1, 1, 0, direction)) {
			
			return true;
		}
		
		return false;
	}
	
	CanvasRenderer.prototype.polygonIntersectLine = function(
		x, y, basePoints, centerX, centerY, width, height, padding) {
		
		var intersections = [];
		var intersection;
		
		var transformedPoints = new Array(basePoints.length);
		
		for (var i = 0; i < transformedPoints.length / 2; i++) {
			transformedPoints[i * 2] = basePoints[i * 2] * width + centerX;
			transformedPoints[i * 2 + 1] = basePoints[i * 2 + 1] * height + centerY;
		}
		
		var points;
		
		if (padding > 0) {
			var expandedLineSet = renderer.expandPolygon(
				transformedPoints,
				-padding);
			
			points = renderer.joinLines(expandedLineSet);
		} else {
			points = transformedPoints;
		}
		// var points = transformedPoints;
		
		var currentX, currentY, nextX, nextY;
		
		for (var i = 0; i < points.length / 2; i++) {
		
			currentX = points[i * 2];
			currentY = points[i * 2 + 1];

			if (i < points.length / 2 - 1) {
				nextX = points[(i + 1) * 2];
				nextY = points[(i + 1) * 2 + 1];
			} else {
				nextX = points[0]; 
				nextY = points[1];
			}
			
			intersection = this.finiteLinesIntersect(
				x, y, centerX, centerY,
				currentX, currentY,
				nextX, nextY);
			
			if (intersection.length != 0) {
				intersections.push(intersection[0], intersection[1]);
			}
		}
		
		return intersections;
	}
	
	CanvasRenderer.prototype.shortenIntersection = function(
		intersection, offset, amount) {
		
		var disp = [intersection[0] - offset[0], intersection[1] - offset[1]];
		
		var length = Math.sqrt(disp[0] * disp[0] + disp[1] * disp[1]);
		
		var lenRatio = (length - amount) / length;
		
		if (lenRatio < 0) {
			return [];
		} else {
			return [offset[0] + lenRatio * disp[0], offset[1] + lenRatio * disp[1]];
		}
	}
	}
	
	// @O Arrow shapes
	{
	// Contract for arrow shapes:
	{
	// 0, 0 is arrow tip
	// (0, 1) is direction towards node
	// (1, 0) is right
	//
	// functional api:
	// collide: check x, y in shape
	// roughCollide: called before collide, no false negatives
	// draw: draw
	// spacing: dist(arrowTip, nodeBoundary)
	// gap: dist(edgeTip, nodeBoundary), edgeTip may != arrowTip
	}
	
	// Declarations
	{
	arrowShapes["arrow"] = {
		_points: [
			-0.15, -0.3,
			0, 0,
			0.15, -0.3
		],
		collide: function(x, y, centerX, centerY, width, height, direction, padding) {
			var points = arrowShapes["arrow"]._points;
			
//			console.log("collide(): " + direction);
			
			return rendFunc.pointInsidePolygon(
				x, y, points, centerX, centerY, width, height, direction, padding);
		},
		roughCollide: function(x, y, centerX, centerY, width, height, direction, padding) {
			if (typeof(arrowShapes["arrow"]._farthestPointSqDistance) == "undefined") {
				arrowShapes["arrow"]._farthestPointSqDistance = 
					rendFunc.findMaxSqDistanceToOrigin(arrowShapes["arrow"]._points);
			}
		
			return rendFunc.checkInBoundingCircle(
				x, y, arrowShapes["arrow"]._farthestPointSqDistance,
				0, width, height, centerX, centerY);
		},
		draw: function(context) {
			var points = arrowShapes["arrow"]._points;
		
			for (var i = 0; i < points.length / 2; i++) {
				context.lineTo(points[i * 2], points[i * 2 + 1]);
			}
		},
		spacing: function(edge) {
			return 0;
		},
		gap: function(edge) {
			return edge._private.style["width"].value * 2;
		}
	}
	
	arrowShapes["triangle"] = arrowShapes["arrow"];
	
	arrowShapes["none"] = {
		collide: function(x, y, centerX, centerY, width, height, direction, padding) {
			return false;
		},
		roughCollide: function(x, y, centerX, centerY, width, height, direction, padding) {
			return false;
		},
		draw: function(context) {
		},
		spacing: function(edge) {
			return 0;
		},
		gap: function(edge) {
			return 0;
		}
	}
	
	arrowShapes["circle"] = {
		_baseRadius: 0.15,
		
		collide: function(x, y, centerX, centerY, width, height, direction, padding) {
			// Transform x, y to get non-rotated ellipse
			
			if (width != height) {
				// This gives negative of the angle
				var angle = Math.asin(direction[1] / 
					(Math.sqrt(direction[0] * direction[0] 
						+ direction[1] * direction[1])));
			
				var cos = Math.cos(-angle);
				var sin = Math.sin(-angle);
				
				var rotatedPoint = 
					[x * cos - y * sin,
						y * cos + x * sin];
				
				var aspectRatio = (height + padding) / (width + padding);
				y /= aspectRatio;
				centerY /= aspectRatio;
				
				return (Math.pow(centerX - x, 2) 
					+ Math.pow(centerY - y, 2) <= Math.pow((width + padding)
						* arrowShapes["circle"]._baseRadius, 2));
			} else {
				return (Math.pow(centerX - x, 2) 
					+ Math.pow(centerY - y, 2) <= Math.pow((width + padding)
						* arrowShapes["circle"]._baseRadius, 2));
			}
		},
		roughCollide: function(x, y, centerX, centerY, width, height, direction, padding) {
			return true;
		},
		draw: function(context) {
			context.arc(0, 0, arrowShapes["circle"]._baseRadius, 0, Math.PI * 2, false);
		},
		spacing: function(edge) {
			return rendFunc.getArrowWidth(edge._private.style["width"].value)
				* arrowShapes["circle"]._baseRadius;
		},
		gap: function(edge) {
			return edge._private.style["width"].value * 2;
		}
	}
	
	arrowShapes["inhibitor"] = {
		_points: [
			-0.25, 0,
			-0.25, -0.1,
			0.25, -0.1,
			0.25, 0
		],
		collide: function(x, y, centerX, centerY, width, height, direction, padding) {
			var points = arrowShapes["inhibitor"]._points;
			
			return rendFunc.pointInsidePolygon(
				x, y, points, centerX, centerY, width, height, direction, padding);
		},
		roughCollide: function(x, y, centerX, centerY, width, height, direction, padding) {
			if (typeof(arrowShapes["inhibitor"]._farthestPointSqDistance) == "undefined") {
				arrowShapes["inhibitor"]._farthestPointSqDistance = 
					rendFunc.findMaxSqDistanceToOrigin(arrowShapes["inhibitor"]._points);
			}
		
			return rendFunc.checkInBoundingCircle(
				x, y, arrowShapes["inhibitor"]._farthestPointSqDistance,
				0, width, height, centerX, centerY);
		},
		draw: function(context) {
			var points = arrowShapes["inhibitor"]._points;
			
			for (var i = 0; i < points.length / 2; i++) {
				context.lineTo(points[i * 2], points[i * 2 + 1]);
			}
		},
		spacing: function(edge) {
			return 4;
		},
		gap: function(edge) {
			return 4;
		}
	}
	
	arrowShapes["square"] = {
		_points: [
			-0.12, 0.00,
			0.12, 0.00,
			0.12, -0.24,
			-0.12, -0.24
		],
		collide: function(x, y, centerX, centerY, width, height, direction, padding) {
			var points = arrowShapes["square"]._points;
			
			return rendFunc.pointInsidePolygon(
				x, y, points, centerX, centerY, width, height, direction, padding);
		},
		roughCollide: function(x, y, centerX, centerY, width, height, direction, padding) {
			if (typeof(arrowShapes["square"]._farthestPointSqDistance) == "undefined") {
				arrowShapes["square"]._farthestPointSqDistance = 
					rendFunc.findMaxSqDistanceToOrigin(arrowShapes["square"]._points);
			}
		
			return rendFunc.checkInBoundingCircle(
				x, y, arrowShapes["square"]._farthestPointSqDistance,
				0, width, height, centerX, centerY);
		},
		draw: function(context) {
			var points = arrowShapes["square"]._points;
		
			for (var i = 0; i < points.length / 2; i++) {
				context.lineTo(points[i * 2], points[i * 2 + 1]);
			}
		},
		spacing: function(edge) {
			return 0;
		},
		gap: function(edge) {
			return edge._private.style["width"].value * 2;
		}
	}
	
	arrowShapes["diamond"] = {
		_points: [
			-0.14, -0.14,
			0, -0.28,
			0.14, -0.14,
			0, 0
		],
		collide: function(x, y, centerX, centerY, width, height, direction, padding) {
			var points = arrowShapes["diamond"]._points;
					
			return rendFunc.pointInsidePolygon(
				x, y, points, centerX, centerY, width, height, direction, padding);
		},
		roughCollide: function(x, y, centerX, centerY, width, height, direction, padding) {
			if (typeof(arrowShapes["diamond"]._farthestPointSqDistance) == "undefined") {
				arrowShapes["diamond"]._farthestPointSqDistance = 
					rendFunc.findMaxSqDistanceToOrigin(arrowShapes["diamond"]._points);
			}
				
			return rendFunc.checkInBoundingCircle(
				x, y, arrowShapes["diamond"]._farthestPointSqDistance,
				0, width, height, centerX, centerY);
		},
		draw: function(context) {
//			context.translate(0, 0.16);
			context.lineTo(-0.14, -0.14);
			context.lineTo(0, -0.28);
			context.lineTo(0.14, -0.14);
			context.lineTo(0, 0.0);
		},
		spacing: function(edge) {
			return 0;
		},
		gap: function(edge) {
			return edge._private.style["width"].value * 2;
		}
	}
	
	arrowShapes["tee"] = arrowShapes["inhibitor"];
	}
	
	// @O Arrow shape sizing (w + l)
	{
	
	CanvasRenderer.prototype.getArrowWidth = function(edgeWidth) {
		return Math.max(Math.pow(edgeWidth * 13.37, 0.9), 29);
	}
	
	CanvasRenderer.prototype.getArrowHeight = function(edgeWidth) {
		return Math.max(Math.pow(edgeWidth * 13.37, 0.9), 29);
	}
	
	}
	
	// @O Arrow shape drawing
	
	// Draw arrowheads on edge
	CanvasRenderer.prototype.drawArrowheads = function(context, edge) {
		// Displacement gives direction for arrowhead orientation
		var dispX, dispY;

		var startX = edge._private.rscratch.arrowStartX;
		var startY = edge._private.rscratch.arrowStartY;
		
		dispX = startX - edge.source().position().x;
		dispY = startY - edge.source().position().y;
		
		//this.context.strokeStyle = "rgba("
		context.fillStyle = "rgba("
			+ edge._private.style["source-arrow-color"].value[0] + ","
			+ edge._private.style["source-arrow-color"].value[1] + ","
			+ edge._private.style["source-arrow-color"].value[2] + ","
			+ edge._private.style.opacity.value + ")";
		
		context.lineWidth = edge._private.style["width"].value;
		
		this.drawArrowShape(context, edge._private.style["source-arrow-shape"].value, 
			startX, startY, dispX, dispY);
		
		var endX = edge._private.rscratch.arrowEndX;
		var endY = edge._private.rscratch.arrowEndY;
		
		dispX = endX - edge.target().position().x;
		dispY = endY - edge.target().position().y;
		
		//this.context.strokeStyle = "rgba("
		context.fillStyle = "rgba("
			+ edge._private.style["target-arrow-color"].value[0] + ","
			+ edge._private.style["target-arrow-color"].value[1] + ","
			+ edge._private.style["target-arrow-color"].value[2] + ","
			+ edge._private.style.opacity.value + ")";
		
		context.lineWidth = edge._private.style["width"].value;
		
		this.drawArrowShape(context, edge._private.style["target-arrow-shape"].value,
			endX, endY, dispX, dispY);
	}
	
	// Draw arrowshape
	CanvasRenderer.prototype.drawArrowShape = function(context, shape, x, y, dispX, dispY) {
	
		// Negative of the angle
		var angle = Math.asin(dispY / (Math.sqrt(dispX * dispX + dispY * dispY)));
	
		if (dispX < 0) {
			//context.strokeStyle = "AA99AA";
			angle = angle + Math.PI / 2;
		} else {
			//context.strokeStyle = "AAAA99";
			angle = - (Math.PI / 2 + angle);
		}
		
		context.save();
		
		context.translate(x, y);
		
		context.moveTo(0, 0);
		context.rotate(-angle);
		
		var size = this.getArrowWidth(context.lineWidth);
		/// size = 100;
		context.scale(size, size);
		
		context.beginPath();
		
		arrowShapes[shape].draw(context);
		
		context.closePath();
		
//		context.stroke();
		context.fill();
		context.restore();
	}
	}
	
	// @O Node shapes
	{
	
	// Generate polygon points
	var generateUnitNgonPoints = function(sides, rotationRadians) {
		
		var increment = 1.0 / sides * 2 * Math.PI;
		var startAngle = sides % 2 == 0 ? 
			Math.PI / 2.0 + increment / 2.0 : Math.PI / 2.0;
//		console.log(nodeShapes["square"]);
		startAngle += rotationRadians;
		
		var points = new Array(sides * 2);
		
		var currentAngle;
		for (var i = 0; i < sides; i++) {
			currentAngle = i * increment + startAngle;
			
			points[2 * i] = Math.cos(currentAngle);// * (1 + i/2);
			points[2 * i + 1] = Math.sin(-currentAngle);//  * (1 + i/2);
		}
		
		return points;
	}
	
	// Node shape declarations
	
	// Contract for node shapes:
	{
	// Node shape contract:
	//
	// draw: draw
	// intersectLine: report intersection from x, y, to node center
	// checkPointRough: heuristic check x, y in node, no false negatives
	// checkPoint: check x, y in node
	}
	
	// Declarations
	{
	nodeShapes["ellipse"] = {
		draw: function(context, node, width, height) {
			context.beginPath();
			context.save();
			context.translate(node._private.position.x, node._private.position.y);
			context.scale(width / 2, height / 2);
			// At origin, radius 1, 0 to 2pi
			context.arc(0, 0, 1, 0, Math.PI * 2, false);
			context.closePath();
			context.restore();
			context.fill();
			
//			console.log("drawing ellipse");
//			console.log(arguments);
			
		},
		
		intersectLine: function(node, width, height, x, y) {
			var intersect = rendFunc.intersectLineEllipse(
				x, y,
				node.position().x,
				node.position().y,
				width / 2 + node._private.style["border-width"].value / 2,
				height / 2 + node._private.style["border-width"].value / 2);
			
			return intersect;
		},
		
		intersectBox: function(
			x1, y1, x2, y2, width, height, centerX, centerY, padding) {
			
			return CanvasRenderer.prototype.boxIntersectEllipse(
				x1, y1, x2, y2, padding, width, height, centerX, centerY);
		},
		
		checkPointRough: function(
			x, y, padding, width, height, centerX, centerY) {
		
			return true;
		},
		
		checkPoint: function(
			x, y, padding, width, height, centerX, centerY) {
			
//			console.log(arguments);
			
			x -= centerX;
			y -= centerY;
			
			x /= (width + padding);
			y /= (height + padding);
			
			return (Math.pow(x, 2) + Math.pow(y, 2) <= 1);
		}
	}
	
	nodeShapes["triangle"] = {
		points: generateUnitNgonPoints(3, 0),
		
		draw: function(node, width, height) {
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y,
				width, height, nodeShapes["triangle"].points);
		},
		
		intersectLine: function(node, width, height, x, y) {
			return renderer.findPolygonIntersection(
				node, width, height,
				x, y, nodeShapes["triangle"].points);
		},
		
		intersectBox: function(
			x1, y1, x2, y2, width, height, centerX, centerY, padding) {
			
			var points = nodeShapes["triangle"].points;
			
			return renderer.boxIntersectPolygon(
				x1, y1, x2, y2,
				points, width, height, centerX, centerY, [0, -1], padding);
		},
		
		checkPointRough: function(
			x, y, padding, width, height, centerX, centerY) {
		
			return renderer.checkInBoundingBox(
				x, y, nodeShapes["triangle"].points, // Triangle?
					padding, width, height, centerX, centerY);
		},
		
		checkPoint: function(
			x, y, padding, width, height, centerX, centerY) {
			
			return renderer.pointInsidePolygon(
				x, y, nodeShapes["triangle"].points,
				centerX, centerY, width, height,
				[0, -1], padding);
		}
	}
	
	nodeShapes["square"] = {
		points: generateUnitNgonPoints(4, 0),
		
		draw: function(node, width, height) {
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y, width, height, nodeShapes["square"].points);
		},
		intersectLine: function(node, width, height, x, y) {
			return (renderer.findPolygonIntersection(
				node, width, height, x, y, nodeShapes["square"].points));
		},
		
		intersectBox: function(
			x1, y1, x2, y2,
			width, height, centerX, 
			centerY, padding) {
			
			var points = nodeShapes["square"].points;
			
			return renderer.boxIntersectPolygon(
				x1, y1, x2, y2,
				points, width, height, centerX, 
				centerY, [0, -1], padding);
		},
		
		checkPointRough: function(
			x, y, padding, width, height,
			centerX, centerY) {
		
			return renderer.checkInBoundingBox(
				x, y, nodeShapes["square"].points, 
					padding, width, height, centerX, centerY);
		},
		
		checkPoint: function(
			x, y, padding, width, height, centerX, centerY) {
			
			return renderer.pointInsidePolygon(x, y, nodeShapes["square"].points,
				centerX, centerY, width, height, [0, -1], padding);
		}
	}
	
	nodeShapes["rectangle"] = nodeShapes["square"];
	
	nodeShapes["octogon"] = {};
	
	nodeShapes["roundrectangle"] = nodeShapes["square"];
	
	nodeShapes["roundrectangle2"] = {
		roundness: 4.99,
		
		draw: function(node, width, height) {
			if (width <= roundness * 2) {
				return;
			}
		
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y, width, height, nodeSapes["roundrectangle2"].points);
		},

		intersectLine: function(node, width, height, x, y) {
			return renderer.findPolygonIntersection(
				node, width, height, x, y, nodeShapes["square"].points);
		},
		
		// TODO: Treat rectangle as sharp-cornered for now. This is a not-large approximation.
		intersectBox: function(x1, y1, x2, y2, width, height, centerX, centerY, padding) {
			var points = nodeShapes["square"].points;
			
			/*
			return renderer.boxIntersectPolygon(
				x1, y1, x2, y2,
				points, 
			*/
		}
		
	}
	
	nodeShapes["pentagon"] = {
		points: generateUnitNgonPoints(5, 0),
		
		draw: function(node, width, height) {
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y, width, height, nodeShapes["pentagon"].points);
		},
		intersectLine: function(node, width, height, x, y) {
			return renderer.findPolygonIntersection(
				node, width, height, x, y, nodeShapes["pentagon"].points);
		},
		
		intersectBox: function(
			x1, y1, x2, y2, width, height, centerX, centerY, padding) {
			
			var points = nodeShapes["pentagon"].points;
			
			return renderer.boxIntersectPolygon(
				x1, y1, x2, y2,
				points, width, height, centerX, centerY, [0, -1], padding);
		},
		
		checkPointRough: function(
			x, y, padding, width, height, centerX, centerY) {
		
			return renderer.checkInBoundingBox(
				x, y, nodeShapes["pentagon"].points, 
					padding, width, height, centerX, centerY);
		},
		
		checkPoint: function(
			x, y, padding, width, height, centerX, centerY) {
			
			return renderer.pointInsidePolygon(x, y, nodeShapes["pentagon"].points,
				centerX, centerY, width, height, [0, -1], padding);
		}
	}
	
	nodeShapes["hexagon"] = {
		points: generateUnitNgonPoints(6, 0),
		
		draw: function(node, width, height) {
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y, width, height, nodeShapes["hexagon"].points);
		},
		intersectLine: function(node, width, height, x, y) {
			return renderer.findPolygonIntersection(
				node, width, height, x, y, nodeShapes["hexagon"].points);
		},
		
		checkPointRough: function(
			x, y, padding, width, height, centerX, centerY) {
		
			return renderer.checkInBoundingBox(
				x, y, nodeShapes["hexagon"].points, 
					padding, width, height, centerX, centerY);
		},
		
		checkPoint: function(
			x, y, padding, width, height, centerX, centerY) {
			
			return renderer.pointInsidePolygon(x, y, nodeShapes["hexagon"].points,
				centerX, centerY, width, height, [0, -1], padding);
		}
	}
	
	nodeShapes["heptagon"] = {
		points: generateUnitNgonPoints(7, 0),
		
		draw: function(node, width, height) {
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y, width, height, nodeShapes["heptagon"].points);
		},
		intersectLine: function(node, width, height, x, y) {
			return renderer.findPolygonIntersection(
				node, width, height, x, y, nodeShapes["heptagon"].points);
		},
		
		checkPointRough: function(
			x, y, padding, width, height, centerX, centerY) {
		
			return checkInBoundingBox(
				x, y, nodeShapes["heptagon"].points, 
					padding, width, height, centerX, centerY);
		},
		
		checkPoint: function(
			x, y, padding, width, height, centerX, centerY) {
			
			return pointInsidePolygon(x, y, nodeShapes["heptagon"].points,
				centerX, centerY, width, height, [0, -1], padding);
		}
	}
	
	nodeShapes["octogon"] = {
		points: generateUnitNgonPoints(8, 0),
		
		draw: function(node, width, height) {
			renderer.drawPolygon(node._private.position.x,
				node._private.position.y, width, height, nodeShapes["octagon"].points);
		},
		intersectLine: function(node, width, height, x, y) {
			return renderer.findPolygonIntersection(
				node, width, height, x, y, nodeShapes["octagon"].points);
		}
	}
	}

	}
	
	// @O Polygon calculations
	{
	CanvasRenderer.prototype.expandPolygon = function(points, pad) {
		
		var expandedLineSet = new Array(points.length * 2);
		
		var currentPointX, currentPointY, nextPointX, nextPointY;
		
		for (var i = 0; i < points.length / 2; i++) {
			currentPointX = points[i * 2];
			currentPointY = points[i * 2 + 1];
			
			if (i < points.length / 2 - 1) {
				nextPointX = points[(i + 1) * 2];
				nextPointY = points[(i + 1) * 2 + 1];
			} else {
				nextPointX = points[0];
				nextPointY = points[1];
			}
			
			// Current line: [currentPointX, currentPointY] to [nextPointX, nextPointY]
			
			// Assume CCW polygon winding
			
			var offsetX = (nextPointY - currentPointY);
			var offsetY = -(nextPointX - currentPointX);
			
			// Normalize
			var offsetLength = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
			var normalizedOffsetX = offsetX / offsetLength;
			var normalizedOffsetY = offsetY / offsetLength;
			
			expandedLineSet[i * 4] = currentPointX + normalizedOffsetX * pad;
			expandedLineSet[i * 4 + 1] = currentPointY + normalizedOffsetY * pad;
			expandedLineSet[i * 4 + 2] = nextPointX + normalizedOffsetX * pad;
			expandedLineSet[i * 4 + 3] = nextPointY + normalizedOffsetY * pad;
		}
		
		return expandedLineSet;
	}
	
	CanvasRenderer.prototype.joinLines = function(lineSet) {
		
		var vertices = new Array(lineSet.length / 2);
		
		var currentLineStartX, currentLineStartY, currentLineEndX, currentLineEndY;
		var nextLineStartX, nextLineStartY, nextLineEndX, nextLineEndY;
		
		for (var i = 0; i < lineSet.length / 4; i++) {
			currentLineStartX = lineSet[i * 4];
			currentLineStartY = lineSet[i * 4 + 1];
			currentLineEndX = lineSet[i * 4 + 2];
			currentLineEndY = lineSet[i * 4 + 3];
			
			if (i < lineSet.length / 4 - 1) {
				nextLineStartX = lineSet[(i + 1) * 4];
				nextLineStartY = lineSet[(i + 1) * 4 + 1];
				nextLineEndX = lineSet[(i + 1) * 4 + 2];
				nextLineEndY = lineSet[(i + 1) * 4 + 3];
			} else {
				nextLineStartX = lineSet[0];
				nextLineStartY = lineSet[1];
				nextLineEndX = lineSet[2];
				nextLineEndY = lineSet[3];
			}
			
			var intersection = this.finiteLinesIntersect(
				currentLineStartX, currentLineStartY,
				currentLineEndX, currentLineEndY,
				nextLineStartX, nextLineStartY,
				nextLineEndX, nextLineEndY,
				true);
			
			vertices[i * 2] = intersection[0];
			vertices[i * 2 + 1] = intersection[1];
		}
		
		return vertices;
	}
	
	CanvasRenderer.prototype.pointInsidePolygon = function(
		x, y, basePoints, centerX, centerY, width, height, direction, padding) {

		//var direction = arguments[6];
		var transformedPoints = new Array(basePoints.length)

		// Gives negative angle
		var angle = Math.asin(direction[1] / (Math.sqrt(direction[0] * direction[0] 
			+ direction[1] * direction[1])));
		
		if (direction[0] < 0) {
			angle = angle + Math.PI / 2;
		} else {
			angle = -angle - Math.PI / 2;
		}
				
		var cos = Math.cos(-angle);
		var sin = Math.sin(-angle);
		
//		console.log("base: " + basePoints);
		for (var i = 0; i < transformedPoints.length / 2; i++) {
			transformedPoints[i * 2] = 
				width * (basePoints[i * 2] * cos
					- basePoints[i * 2 + 1] * sin);
			
			transformedPoints[i * 2 + 1] = 
				height * (basePoints[i * 2 + 1] * cos 
					+ basePoints[i * 2] * sin);

			transformedPoints[i * 2] += centerX;
			transformedPoints[i * 2 + 1] += centerY;
		}
		
		var points;
		
		if (padding > 0) {
			var expandedLineSet = renderer.expandPolygon(
				transformedPoints,
				-padding);
			
			points = renderer.joinLines(expandedLineSet);
		} else {
			points = transformedPoints;
		}
		
		var x1, y1, x2, y2;
		var y3;
		
		// Intersect with vertical line through (x, y)
		var up = 0;
		var down = 0;
		for (var i = 0; i < points.length / 2; i++) {
			
			x1 = points[i * 2];
			y1 = points[i * 2 + 1];
			
			if (i + 1 < points.length / 2) {
				x2 = points[(i + 1) * 2];
				y2 = points[(i + 1) * 2 + 1];
			} else {
				x2 = points[(i + 1 - points.length / 2) * 2];
				y2 = points[(i + 1 - points.length / 2) * 2 + 1];
			}
			
//*			console.log("line from (" + x1 + ", " + y1 + ") to (" + x2 + ", " + y2 + ")");

//&			console.log(x1, x, x2);

			if (x1 == x && x2 == x) {
				
			} else if ((x1 >= x && x >= x2)
				|| (x1 <= x && x <= x2)) {
				
				y3 = (x - x1) / (x2 - x1) * (y2 - y1) + y1;
				
				if (y3 > y) {
					up++;
				}
				
				if (y3 < y) {
					down++;
				}
				
//*				console.log(y3, y);
				
			} else {
//*				console.log("22");
				continue;
			}
			
		}
		
//*		console.log("up: " + up + ", down: " + down);
		
		if (up % 2 == 0) {
			return false;
		} else {
			return true;
		}
	}
	}
	
	// @O Polygon drawing
	CanvasRenderer.prototype.drawPolygon = function(
		x, y, width, height, points) {

		var context = cy.renderer().context;
		context.save();
		context.translate(x, y);
		context.beginPath();
		
		context.scale(width / 2, height / 2);
		context.moveTo(points[0], points[1]);
		
		for (var i = 1; i < points.length / 2; i++) {
			context.lineTo(points[i * 2], points[i * 2 + 1]);
		}
		
		context.closePath();
		context.fill();
		
		context.restore();
	}
	
	// @O Approximate collision functions
	CanvasRenderer.prototype.checkInBoundingCircle = function(
		x, y, farthestPointSqDistance, padding, width, height, centerX, centerY) {
		
		x = (x - centerX) / (width + padding);
		y = (y - centerY) / (height + padding);
		
		return (x * x + y * y) <= farthestPointSqDistance;
	}
	
	CanvasRenderer.prototype.checkInBoundingBox = function(
		x, y, points, padding, width, height, centerX, centerY) {
		
		// Assumes width, height >= 0, points.length > 0
		
		var minX = points[0], minY = points[1];
		var maxX = points[0], maxY = points[1];
		
		for (var i = 1; i < points.length / 2; i++) {
			
			if (points[i * 2] < minX) {
				minX = points[i * 2];
			} else if (points[i * 2] > maxX) {
				maxX = points[i * 2];
			}
			
			if (points[i * 2 + 1] < minY) {
				minY = points[i * 2 + 1];
			} else if (points[i * 2 + 1] > maxY) {
				maxY = points[i * 2 + 1];
			}
		}
		
		x -= centerX;
		y -= centerY;
		
		x /= width;
		y /= height;
		
		if (x < minX) {
			return false;
		} else if (x > maxX) {
			return false;
		}
		
		if (y < minY) {
			return false;
		} else if (y > maxY) {
			return false;
		}
		
		return true;
	}
	
	// @O Straight/bezier edge approximate collision, precise collision, and distance calculation functions
	{
	CanvasRenderer.prototype.boxInBezierVicinity = function(
		x1box, y1box, x2box, y2box, x1, y1, x2, y2, x3, y3, tolerance) {
		
		// Return values:
		// 0 - curve is not in box
		// 1 - curve may be in box; needs precise check
		// 2 - curve is in box
		
		var boxMinX = Math.min(x1box, x2box) - tolerance;
		var boxMinY = Math.min(y1box, y2box) - tolerance;
		var boxMaxX = Math.max(x1box, x2box) + tolerance;
		var boxMaxY = Math.max(y1box, y2box) + tolerance;
		
		if (x1 >= boxMinX && x1 <= boxMaxX && y1 >= boxMinY && y1 <= boxMaxY) {
			return 2;
		} else if (x3 >= boxMinX && x3 <= boxMaxX && y3 >= boxMinY && y3 <= boxMaxY) {
			return 2;
		} else if (x2 >= boxMinX && x2 <= boxMaxX && y2 >= boxMinY && y2 <= boxMaxY) { 
			return 1;
		}
		
		var curveMinX = Math.min(x1, x2, x3);
		var curveMinY = Math.min(y1, y2, y3);
		var curveMaxX = Math.max(x1, x2, x3);
		var curveMaxY = Math.max(y1, y2, y3);
		
		/*
		console.log(curveMinX + ", " + curveMinY + ", " + curveMaxX 
			+ ", " + curveMaxY);
		if (curveMinX == undefined) {
			console.log("undefined curveMinX: " + x1 + ", " + x2 + ", " + x3);
		}
		*/
		
		if (curveMinX > boxMaxX
			|| curveMaxX < boxMinX
			|| curveMinY > boxMaxY
			|| curveMaxY < boxMinY) {
			
			return 0;	
		}
		
		return 1;
	}
	
	CanvasRenderer.prototype.checkStraightEdgeCrossesBox = function(
		x1box, y1box, x2box, y2box, x1, y1, x2, y2, tolerance) {
		
	 //console.log(arguments);
		
		var boxMinX = Math.min(x1box, x2box) - tolerance;
		var boxMinY = Math.min(y1box, y2box) - tolerance;
		var boxMaxX = Math.max(x1box, x2box) + tolerance;
		var boxMaxY = Math.max(y1box, y2box) + tolerance;
		
		// Check left + right bounds
		var aX = x2 - x1;
		var bX = x1;
		var yValue;
		
		// Top and bottom
		var aY = y2 - y1;
		var bY = y1;
		var xValue;
		
		if (Math.abs(aX) < 0.0001) {
			return (x1 >= boxMinX && x1 <= boxMaxX
				&& Math.min(y1, y2) <= boxMinY
				&& Math.max(y1, y2) >= boxMaxY);	
		}
		
		var tLeft = (boxMinX - bX) / aX;
		if (tLeft > 0 && tLeft <= 1) {
			yValue = aY * tLeft + bY;
			if (yValue >= boxMinY && yValue <= boxMaxY) {
				return true;
			} 
		}
		
		var tRight = (boxMaxX - bX) / aX;
		if (tRight > 0 && tRight <= 1) {
			yValue = aY * tRight + bY;
			if (yValue >= boxMinY && yValue <= boxMaxY) {
				return true;
			} 
		}
		
		var tTop = (boxMinY - bY) / aY;
		if (tTop > 0 && tTop <= 1) {
			xValue = aX * tTop + bX;
			if (xValue >= boxMinX && xValue <= boxMaxX) {
				return true;
			} 
		}
		
		var tBottom = (boxMaxY - bY) / aY;
		if (tBottom > 0 && tBottom <= 1) {
			xValue = aX * tBottom + bX;
			if (xValue >= boxMinX && xValue <= boxMaxX) {
				return true;
			} 
		}
		
		return false;
	}
	
	CanvasRenderer.prototype.checkBezierCrossesBox = function(
		x1box, y1box, x2box, y2box, x1, y1, x2, y2, x3, y3, tolerance) {
		
		var boxMinX = Math.min(x1box, x2box) - tolerance;
		var boxMinY = Math.min(y1box, y2box) - tolerance;
		var boxMaxX = Math.max(x1box, x2box) + tolerance;
		var boxMaxY = Math.max(y1box, y2box) + tolerance;
		
		if (x1 >= boxMinX && x1 <= boxMaxX && y1 >= boxMinY && y1 <= boxMaxY) {
			return true;
		} else if (x3 >= boxMinX && x3 <= boxMaxX && y3 >= boxMinY && y3 <= boxMaxY) {
			return true;
		}
		
		var aX = x1 - 2 * x2 + x3;
		var bX = -2 * x1 + 2 * x2;
		var cX = x1;

		var xIntervals = [];
		
		if (Math.abs(aX) < 0.0001) {
			var leftParam = (boxMinX - x1) / bX;
			var rightParam = (boxMaxX - x1) / bX;
			
			xIntervals.push(leftParam, rightParam);
		} else {
			// Find when x coordinate of the curve crosses the left side of the box
			var discriminantX1 = bX * bX - 4 * aX * (cX - boxMinX);
			var tX1, tX2;
			if (discriminantX1 > 0) {
				var sqrt = Math.sqrt(discriminantX1);
				tX1 = (-bX + sqrt) / (2 * aX);
				tX2 = (-bX - sqrt) / (2 * aX);
				
				xIntervals.push(tX1, tX2);
			}
			
			var discriminantX2 = bX * bX - 4 * aX * (cX - boxMaxX);
			var tX3, tX4;
			if (discriminantX2 > 0) {
				var sqrt = Math.sqrt(discriminantX2);
				tX3 = (-bX + sqrt) / (2 * aX);
				tX4 = (-bX - sqrt) / (2 * aX);
				
				xIntervals.push(tX3, tX4);
			}
		}
		
		xIntervals.sort(function(a, b) { return a - b; });
		
		var aY = y1 - 2 * y2 + y3;
		var bY = -2 * y1 + 2 * y2;
		var cY = y1;
		
		var yIntervals = [];
		
		if (Math.abs(aY) < 0.0001) {
			var topParam = (boxMinY - y1) / bY;
			var bottomParam = (boxMaxY - y1) / bY;
			
			yIntervals.push(topParam, bottomParam);
		} else {
			var discriminantY1 = bY * bY - 4 * aY * (cY - boxMinY);
			
			var tY1, tY2;
			if (discriminantY1 > 0) {
				var sqrt = Math.sqrt(discriminantY1);
				tY1 = (-bY + sqrt) / (2 * aY);
				tY2 = (-bY - sqrt) / (2 * aY);
				
				yIntervals.push(tY1, tY2);
			}
	
			var discriminantY2 = bY * bY - 4 * aY * (cY - boxMaxY);
			
			var tY3, tY4;
			if (discriminantY2 > 0) {
				var sqrt = Math.sqrt(discriminantY2);
				tY3 = (-bY + sqrt) / (2 * aY);
				tY4 = (-bY - sqrt) / (2 * aY);
				
				yIntervals.push(tY3, tY4);
			}
		}
				
		yIntervals.sort(function(a, b) { return a - b; });

		for (var index = 0; index < xIntervals.length; index += 2) {
			for (var yIndex = 1; yIndex < yIntervals.length; yIndex += 2) {
				
				// Check if there exists values for the Bezier curve
				// parameter between 0 and 1 where both the curve's
				// x and y coordinates are within the bounds specified by the box
				if (xIntervals[index] < yIntervals[yIndex]
					&& yIntervals[yIndex] >= 0.0
					&& xIntervals[index] <= 1.0
					&& xIntervals[index + 1] > yIntervals[yIndex - 1]
					&& yIntervals[yIndex - 1] <= 1.0
					&& xIntervals[index + 1] >= 0.0) {
					
					return true;
				}
			}
		}
		
		return false;
	}
	
	CanvasRenderer.prototype.inBezierVicinity = function(
		x, y, x1, y1, x2, y2, x3, y3, toleranceSquared) {
		
		// Middle point occurs when t = 0.5, this is when the Bezier
		// is closest to (x2, y2)
		var middlePointX = 0.25 * x1 + 0.5 * x2 + 0.25 * x3;
		var middlePointY = 0.25 * y1 + 0.5 * y2 + 0.25 * y3;
		
		var displacementX, displacementY, offsetX, offsetY;
		var dotProduct, dotSquared, hypSquared;
		var outside = function(x, y, startX, startY, endX, endY,
				toleranceSquared, counterClockwise) {

			dotProduct = (endY - startY) * (x - startX) + (startX - endX) * (y - startY);
			dotSquared = dotProduct * dotProduct;
			sideSquared = (endY - startY) * (endY - startY) 
				+ (startX - endX) * (startX - endX);

			if (counterClockwise) {
				if (dotProduct > 0) {
					return false;
				}
			} else {
				if (dotProduct < 0) {
					return false;
				}
			}
			
			return (dotSquared / sideSquared > toleranceSquared);
		};
		
		// Used to check if the test polygon winding is clockwise or counterclockwise
		var testPointX = (middlePointX + x2) / 2.0;
		var testPointY = (middlePointY + y2) / 2.0;
		
		var counterClockwise = true;
		
		// The test point is always inside
		if (outside(testPointX, testPointY, x1, y1, x2, y2, 0, counterClockwise)) {
			counterClockwise = !counterClockwise;
		}
		
		/*
		return (!outside(x, y, x1, y1, x2, y2, toleranceSquared, counterClockwise)
			&& !outside(x, y, x2, y2, x3, y3, toleranceSquared, counterClockwise)
			&& !outside(x, y, x3, y3, middlePointX, middlePointY, toleranceSquared,
				counterClockwise)
			&& !outside(x, y, middlePointX, middlePointY, x1, y1, toleranceSquared,
				counterClockwise)
		);
		*/
		
		return (!outside(x, y, x1, y1, x2, y2, toleranceSquared, counterClockwise)
			&& !outside(x, y, x2, y2, x3, y3, toleranceSquared, counterClockwise)
			&& !outside(x, y, x3, y3, x1, y1, toleranceSquared,
				counterClockwise)
		);
	}
	
	CanvasRenderer.prototype.solveCubic = function(a, b, c, d, result) {
		
		// Solves a cubic function, returns root in form [r1, i1, r2, i2, r3, i3], where
		// r is the real component, i is the imaginary component

		// An implementation of the Cardano method from the year 1545
		// http://en.wikipedia.org/wiki/Cubic_function#The_nature_of_the_roots

		b /= a;
		c /= a;
		d /= a;
		
		var discriminant, q, r, dum1, s, t, term1, r13;

		q = (3.0 * c - (b * b)) / 9.0;
		r = -(27.0 * d) + b * (9.0 * c - 2.0 * (b * b));
		r /= 54.0;
		
		discriminant = q * q * q + r * r;
		result[1] = 0;
		term1 = (b / 3.0);
		
		if (discriminant > 0) {
			s = r + Math.sqrt(discriminant);
			s = ((s < 0) ? -Math.pow(-s, (1.0 / 3.0)) : Math.pow(s, (1.0 / 3.0)));
			t = r - Math.sqrt(discriminant);
			t = ((t < 0) ? -Math.pow(-t, (1.0 / 3.0)) : Math.pow(t, (1.0 / 3.0)));
			result[0] = -term1 + s + t;
			term1 += (s + t) / 2.0;
			result[4] = result[2] = -term1;
			term1 = Math.sqrt(3.0) * (-t + s) / 2;
			result[3] = term1;
			result[5] = -term1;
			return;
		}
		
		result[5] = result[3] = 0;
		
		if (discriminant == 0) {
			r13 = ((r < 0) ? -Math.pow(-r, (1.0 / 3.0)) : Math.pow(r, (1.0 / 3.0)));
			result[0] = -term1 + 2.0 * r13;
			result[4] = result[2] = -(r13 + term1);
			return;
		}
		
		q = -q;
		dum1 = q * q * q;
		dum1 = Math.acos(r / Math.sqrt(dum1));
		r13 = 2.0 * Math.sqrt(q);
		result[0] = -term1 + r13 * Math.cos(dum1 / 3.0);
		result[2] = -term1 + r13 * Math.cos((dum1 + 2.0 * Math.PI) / 3.0);
		result[4] = -term1 + r13 * Math.cos((dum1 + 4.0 * Math.PI) / 3.0);
		
		return;
	}

	CanvasRenderer.prototype.sqDistanceToQuadraticBezier = function(
		x, y, x1, y1, x2, y2, x3, y3) {
		
		// Find minimum distance by using the minimum of the distance 
		// function between the given point and the curve
		
		// This gives the coefficients of the resulting cubic equation
		// whose roots tell us where a possible minimum is
		// (Coefficients are divided by 4)
		
		var a = 1.0 * x1*x1 - 4*x1*x2 + 2*x1*x3 + 4*x2*x2 - 4*x2*x3 + x3*x3
			+ y1*y1 - 4*y1*y2 + 2*y1*y3 + 4*y2*y2 - 4*y2*y3 + y3*y3;
		
		var b = 1.0 * 9*x1*x2 - 3*x1*x1 - 3*x1*x3 - 6*x2*x2 + 3*x2*x3
			+ 9*y1*y2 - 3*y1*y1 - 3*y1*y3 - 6*y2*y2 + 3*y2*y3;
		
		var c = 1.0 * 3*x1*x1 - 6*x1*x2 + x1*x3 - x1*x + 2*x2*x2 + 2*x2*x - x3*x
			+ 3*y1*y1 - 6*y1*y2 + y1*y3 - y1*y + 2*y2*y2 + 2*y2*y - y3*y;
			
		var d = 1.0 * x1*x2 - x1*x1 + x1*x - x2*x
			+ y1*y2 - y1*y1 + y1*y - y2*y;
		
		debug("coefficients: " + a / a + ", " + b / a + ", " + c / a + ", " + d / a);
		
		var roots = [];
		
		// Use the cubic solving algorithm
		this.solveCubic(a, b, c, d, roots);
		
		var zeroThreshold = 0.0000001;
		
		var params = [];
		
		for (var index = 0; index < 6; index += 2) {
			if (Math.abs(roots[index + 1]) < zeroThreshold
					&& roots[index] >= 0
					&& roots[index] <= 1.0) {
				params.push(roots[index]);
			}
		}
		
		params.push(1.0);
		params.push(0.0);
		
		var minDistanceSquared = -1;
		var closestParam;
		
		var curX, curY, distSquared;
		for (var i = 0; i < params.length; i++) {
			curX = Math.pow(1.0 - params[i], 2.0) * x1
				+ 2.0 * (1 - params[i]) * params[i] * x2
				+ params[i] * params[i] * x3;
				
			curY = Math.pow(1 - params[i], 2.0) * y1
				+ 2 * (1.0 - params[i]) * params[i] * y2
				+ params[i] * params[i] * y3;
				
			distSquared = Math.pow(curX - x, 2) + Math.pow(curY - y, 2);
			debug("distance for param " + params[i] + ": " + Math.sqrt(distSquared));
			if (minDistanceSquared >= 0) {
				if (distSquared < minDistanceSquared) {
					minDistanceSquared = distSquared;
					closestParam = params[i];
				}
			} else {
				minDistanceSquared = distSquared;
				closestParam = params[i];
			}
		}
		
		/*
		debugStats.clickX = x;
		debugStats.clickY = y;
		
		debugStats.closestX = Math.pow(1.0 - closestParam, 2.0) * x1
				+ 2.0 * (1.0 - closestParam) * closestParam * x2
				+ closestParam * closestParam * x3;
				
		debugStats.closestY = Math.pow(1.0 - closestParam, 2.0) * y1
				+ 2.0 * (1.0 - closestParam) * closestParam * y2
				+ closestParam * closestParam * y3;
		*/
		
		debug("given: " 
			+ "( " + x + ", " + y + "), " 
			+ "( " + x1 + ", " + y1 + "), " 
			+ "( " + x2 + ", " + y2 + "), "
			+ "( " + x3 + ", " + y3 + ")");
		
		
		debug("roots: " + roots);
		debug("params: " + params);
		debug("closest param: " + closestParam);
		return minDistanceSquared;
	}
	
	CanvasRenderer.prototype.sqDistanceToFiniteLine = function(x, y, x1, y1, x2, y2) {
		var offset = [x - x1, y - y1];
		var line = [x2 - x1, y2 - y1];
		
		var lineSq = line[0] * line[0] + line[1] * line[1];
		var hypSq = offset[0] * offset[0] + offset[1] * offset[1];
		var adjSq = Math.pow(offset[0] * line[0] + offset[1] * line[1], 2) / lineSq;
		
		if (adjSq < 0) {
			return hypSq;
		}
		
		if (adjSq > lineSq) {
			return (x - x2) * (x - x2) + (y - y2) * (y - y2);
		}
		
		return (hypSq - adjSq);
	}
	}
	
	var debug = function(){};
	$$("renderer", "canvas", CanvasRenderer);
	
})( cytoscape );
