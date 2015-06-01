//= require jquery.simulate
//= require typeahead.jquery.min.js
//= require algoliasearch.jquery.min.js

OSM.Search = function(map) {

    $(".search_form input[name=query]").on("input", function(e) {
      if ($(e.target).val() == "") {
        $(".describe_location").fadeIn(100);
      } else {
        $(".describe_location").fadeOut(100);
      }
    });

  $("#sidebar_content")
    .on("click", ".search_more a", clickSearchMore)
    .on("click", ".search_results_entry a.set_position", clickSearchResult)
    .on("mouseover", "p.search_results_entry:has(a.set_position)", showSearchResult)
    .on("mouseout", "p.search_results_entry:has(a.set_position)", hideSearchResult)
    .on("mousedown", "p.search_results_entry:has(a.set_position)", function () {
      var moved = false;
      $(this).one("click", function (e) {
        if (!moved && !$(e.target).is('a')) {
          $(this).find("a.set_position").simulate("click", e);
        }
      }).one("mousemove", function () {
        moved = true;
      });
    });

  function clickSearchMore(e) {
    e.preventDefault();
    e.stopPropagation();

    var div = $(this).parents(".search_more");

    $(this).hide();
    div.find(".loader").show();

    $.get($(this).attr("href"), function(data) {
      div.replaceWith(data);
    });
  }

  function showSearchResult(e) {
    var marker = $(this).data("marker");

    if (!marker) {
      var data = $(this).find("a.set_position").data();

      marker = L.marker([data.lat, data.lon], {icon: getUserIcon()});

      $(this).data("marker", marker);
    }

    markers.addLayer(marker);

    $(this).closest("li").addClass("selected");
  }

  function hideSearchResult(e) {
    var marker = $(this).data("marker");

    if (marker) {
      markers.removeLayer(marker);
    }

    $(this).closest("li").removeClass("selected");
  }

  function clickSearchResult(e) {
    var data = $(this).data(),
      center = L.latLng(data.lat, data.lon);

    if (data.minLon && data.minLat && data.maxLon && data.maxLat) {
      map.fitBounds([[data.minLat, data.minLon], [data.maxLat, data.maxLon]]);
    } else {
      map.setView(center, data.zoom);
    }

    // Let clicks to object browser links propagate.
    if (data.type && data.id) return;

    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Generates a dynamic Algolia adapter that
   * will consider current map geolocation.
   */
  function newAlgoliaAdapter() {

    var geo, adapter;
    var aroundRadius = Math.round(40075160 / 1.5); // Earth circumference / 1.5

    return $.throttle(200, function() {

      var newGeo = OSM.mapParams();

      // Renew the adapter each time the position changed
      if (!geo || !adapter || geo.lon !== newGeo.lon || geo.lat !== newGeo.lat) {
        geo = newGeo;
        adapter = algolia.cities.ttAdapter({
          hitsPerPage: 5,
          aroundLatLng: geo.lat + "," + geo.lon,
          aroundRadius: aroundRadius,
          aroundPrecision: distanceZoomFormula(5000000, geo.zoom)
        });
      }

      adapter.apply(this, arguments);
    });
  }

  /**
   * A formula that reduces a world globe distance depending the zoom.
   * @param (Number) baseDist - The base globe distance
   * @param (Number) zoom - The zoom
   */
  function distanceZoomFormula(baseDist, zoom) {
    return Math.round(baseDist / Math.pow(Math.max(zoom - 1, 1), 2));
  }

  /**
   * Alterates original twitter's typeahead wrapper to avoid overflow issues.
   * @param (jqElement) $searchElement - The typeahead to unwrap
   * @param (jqElement) $relativeParent - The relative parent of $searchElement to move typeahead suggestions to
   */
  function unwrapTypeahead($searchElement, $relativeParent) {
    var $typeaheadWrapper = $searchElement.parent();

    // Move search input back to its old wrapper
    $typeaheadWrapper.parent().append($searchElement.detach());

    // Absoltue position typeahead
    $typeaheadWrapper = $typeaheadWrapper.detach();
    $typeaheadWrapper.addClass("tt-search");
    $typeaheadWrapper.css("position", "absolute");
    $typeaheadWrapper.css("z-index", 1500);

    $searchElement.data("unwrapTypeahead", {
      $typeahead: $typeaheadWrapper,
      $relativeParent: $relativeParent
    });

    refreshTtSearchStyle($searchElement);
    $relativeParent.append($typeaheadWrapper);
  }

  /**
   * Refreshes the style of an unwrapped typeahead according to
   * the original search input's style properties.
   * @param (jqElement) $searchElement - The unwrapped typeahead
   */
  function refreshTtSearchStyle($searchElement) {
    var elementData = $searchElement.data("unwrapTypeahead");
    var $typeahead = elementData.$typeahead;
    var $parent = elementData.$relativeParent;

    var searchElementOffset = $searchElement.offset();
    var parentOffset = $parent.offset();

    $typeahead.width($searchElement.outerWidth());
    $typeahead.offset({
      top: searchElementOffset.top - parentOffset.top + $searchElement.outerHeight(),
      left: searchElementOffset.left - parentOffset.left
    });
  }

  var markers = L.layerGroup().addTo(map);

  var $searchInput = $("#sidebar .search_form input[name=query]");

  var algolia = {};
  algolia.client = $.algolia.Client('977AC8JAJ4', '0958707ae59201f1fbf4c14b5397b7ab');
  algolia.cities = algolia.client.initIndex('Cities');

  $searchInput
    .typeahead({
        hint: false,
        highlight: true
      }, {
        name: 'name',
        source: newAlgoliaAdapter(),
        display: function(hit) {
          return hit.name;
        },
        templates: {
          suggestion: function(hit) {
            return '<span class="place-icon">&nbsp;</span>' + hit.name +
              ' <span class="country">' + hit.country.name + '</span>';
          }
        }
      })
    .on("typeahead:selected", function(e, hit) {
      // Move the given location on Selection
      window.location.hash = OSM.formatHash({
        zoom: 12,
        lat: hit._geoloc.lat,
        lon: hit._geoloc.lng
      });
    });

  unwrapTypeahead($searchInput, $("#sidebar"));

  var page = {};

  page.pushstate = page.popstate = function(path) {
    var params = querystring.parse(path.substring(path.indexOf('?') + 1));
    $(".search_form input[name=query]").val(params.query);
    OSM.loadSidebarContent(path, page.load);
    $searchInput.typeahead("close");
  };

  page.load = function() {
    $(".search_results_entry").each(function() {
      var entry = $(this);
      $.ajax({
        url: entry.data("href"),
        method: 'GET',
        data: {
          zoom: map.getZoom(),
          minlon: map.getBounds().getWest(),
          minlat: map.getBounds().getSouth(),
          maxlon: map.getBounds().getEast(),
          maxlat: map.getBounds().getNorth()
        },
        success: function(html) {
          entry.html(html);
        }
      });
    });

    return map.getState();
  };

  page.unload = function() {
    markers.clearLayers();
    $(".search_form input[name=query]").val("");
    $(".describe_location").fadeIn(100);
  };

  return page;
};
