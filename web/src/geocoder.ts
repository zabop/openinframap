import i18next from 'i18next'
import { el } from 'redom'
import { IControl, LngLat, LngLatBounds, Map, Marker } from 'maplibre-gl'
import { convert as convert_coords } from 'geo-coordinates-parser'
import { OpenCageGeoSearchPlugin } from '@opencage/geosearch-core'
import { autocomplete, AutocompletePlugin } from '@algolia/autocomplete-js'
import '@algolia/autocomplete-theme-classic'

function latLonSearchPlugin(map: Map): AutocompletePlugin<any, any> {
  return {
    getSources() {
      let marker: Marker | null = null
      return [
        {
          sourceId: 'lat-lon',
          getItems({ query }) {
            if (marker) {
              marker.remove()
              marker = null
            }
            if (!query) {
              return []
            }

            let coords
            try {
              coords = convert_coords(query)
            } catch {
              return []
            }

            return [
              {
                label: query,
                value: {
                  geometry: {
                    lat: coords.decimalLatitude.toFixed(5),
                    lng: coords.decimalLongitude.toFixed(5)
                  }
                }
              }
            ]
          },
          onSelect({ item }) {
            marker = new Marker().setLngLat([item.value.geometry.lng, item.value.geometry.lat]).addTo(map)

            map.flyTo({
              center: [item.value.geometry.lng, item.value.geometry.lat],
              zoom: 12
            })
          },
          onReset() {
            if (marker) {
              marker.remove()
              marker = null
            }
          },
          templates: {
            item({ item }) {
              return `Coordinates: ${item.label}`
            }
          }
        }
      ]
    }
  }
}

export default class OpenInfraMapGeocoder implements IControl {
  map?: Map
  container?: HTMLElement

  onAdd(map: Map): HTMLElement {
    this.map = map
    this.container = el('div.maplibregl-ctrl#geo-search')
    autocomplete({
      container: this.container,
      plugins: [
        latLonSearchPlugin(map),
        OpenCageGeoSearchPlugin(
          {
            key: 'oc_gs_3f87b1a868984ee19fd37ab82a87ad63',
            language: i18next.language
          },
          {
            onSelect: ({ item }) => {
              if (item.bounds) {
                const bounds = new LngLatBounds(
                  new LngLat(item.bounds.southwest.lng, item.bounds.southwest.lat),
                  new LngLat(item.bounds.northeast.lng, item.bounds.northeast.lat)
                )
                map.fitBounds(bounds, { padding: 50 })
              } else {
                map.flyTo({
                  center: [item.geometry.lng, item.geometry.lat],
                  zoom: 12
                })
              }
            }
          }
        )
      ]
    })

    // Focus on ctrl+f/cmd+f
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.container?.querySelector('input')?.focus()
      }
    })
    return this.container
  }

  onRemove(): void {}
}
