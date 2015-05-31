//= require jquery.simulate
//= require typeahead.jquery.min.js
//= require algoliasearch.jquery.min.js

OSM.Search = function(map) {

  // Algolia search suggestions
  var algolia = {};

  algolia.client = $.algolia.Client('977AC8JAJ4', '0958707ae59201f1fbf4c14b5397b7ab');
  algolia.cities = algolia.client.initIndex('Cities');
  algolia.search = $.throttle(100, searchSuggestions);

  $(".search_form input[name=query]").on("input", function(e) {
    if ($(e.target).val() == "") {
      $(".describe_location").fadeIn(100);
    } else {
      $(".describe_location").fadeOut(100);
    }
  });

  var $searchInput = $("#sidebar .search_form input[name=query]");
  var $sidebar = $("#sidebar");

  $searchInput.typeahead({
      hint: false,
      highlight: true
    }, {
      name: 'name',
      source: algolia.cities.ttAdapter({hitsPerPage: 5}),
      display: function(hit) {
        return hit.name;
      },
      templates: {
        suggestion: function(hit) {
          return hit.name +
            ' <span class="country">' + hit.countryCode + '</span>';
        }
      }
    });

  // Move typeahead dropdown to the root of the sidebar, otherwise we'll have overflow issues
  var sidebarOffset = $sidebar.offset();
  var searchInputOffset = $searchInput.offset();
  var $typeaheadWrapper = $searchInput.parent();

  // Move search input back to its old wrapper
  $typeaheadWrapper.parent().append($searchInput.detach());

  // Absoltue position typeahead
  $typeaheadWrapper = $typeaheadWrapper.detach();
  $typeaheadWrapper.addClass("tt-search");
  $typeaheadWrapper.width($searchInput.outerWidth());
  $typeaheadWrapper.css("position", "absolute");
  $typeaheadWrapper.css("z-index", 1500);
  $typeaheadWrapper.offset({
    top: searchInputOffset.top - sidebarOffset.top + $searchInput.outerHeight(),
    left: searchInputOffset.left - sidebarOffset.left
  });

  $sidebar.append($typeaheadWrapper);


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

  function searchSuggestions($target, cityArg) {

    algolia.index.search(cityArg)
      .then(function searchDone(content) {
        console.log(content);
      })
      .fail(function (err) {
        console.error(err);
      });
  }

  var markers = L.layerGroup().addTo(map);

  var page = {};

  page.pushstate = page.popstate = function(path) {
    var params = querystring.parse(path.substring(path.indexOf('?') + 1));
    $(".search_form input[name=query]").val(params.query);
    OSM.loadSidebarContent(path, page.load);
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
