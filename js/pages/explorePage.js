import { getExplorationPoints, explorePoint, getProfile } from '../api.js';
import { showToast } from '../utils.js';
import { createIcons, icons } from 'lucide';
import { updateGlobalShells } from '../auth.js';

let currentLocation = null;
let explorationPoints = [];
let selectedPoint = null;
let map = null;
let markers = [];
let userMarker = null;
let poiMarkers = [];
let circleLayers = [];

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

function wgs84ToGcj02(wgsLat, wgsLng) {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    
    if (outOfChina(wgsLat, wgsLng)) {
        return { lat: wgsLat, lng: wgsLng };
    }
    
    let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
    let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0);
    
    const radLat = wgsLat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    
    return {
        lat: wgsLat + dLat,
        lng: wgsLng + dLng
    };
}

function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}

function gcj02ToWgs84(gcjLat, gcjLng) {
    if (outOfChina(gcjLat, gcjLng)) {
        return { lat: gcjLat, lng: gcjLng };
    }
    
    let dLat = transformLat(gcjLng - 105.0, gcjLat - 35.0);
    let dLng = transformLng(gcjLng - 105.0, gcjLat - 35.0);
    
    const radLat = gcjLat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - 0.00669342162296594323 * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (6378245.0 / sqrtMagic * Math.cos(radLat) * Math.PI);
    
    return {
        lat: gcjLat - dLat,
        lng: gcjLng - dLng
    };
}

export const explorePage = {
    async render(container) {
        await this.loadData();
        this.initMap();
        this.attachEvents();
        createIcons({ icons });
    },

    async loadData() {
        try {
            explorationPoints = await getExplorationPoints();
            this.updatePointList();
        } catch (e) {
            console.error('加载探索点失败:', e);
            document.getElementById('explore-point-list').innerHTML = 
                '<div class="explore-loading"><i data-lucide="alert-circle"></i> 加载失败</div>';
        }
    },

    initMap() {
        const mapContainer = document.getElementById('map-container');
        
        if (!window.L) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => {
                this.initMapAfterLoad();
            };
            script.onerror = () => {
                document.getElementById('map-loading').style.display = 'none';
                document.getElementById('map-error').style.display = 'flex';
            };
            document.head.appendChild(script);
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        } else {
            this.initMapAfterLoad();
        }
    },

    initMapAfterLoad() {
        document.getElementById('map-loading').style.display = 'none';
        
        map = L.map('map-container', {
            zoomControl: false,
            attributionControl: false
        }).setView([39.9042, 116.4074], 14);
        
        L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
            subdomains: '1234',
            attribution: '© 高德地图'
        }).addTo(map);

        L.control.zoom({
            position: 'bottomright'
        }).addTo(map);

        map.invalidateSize();

        this.showLocation();
        this.addPointMarkers();
        this.fetchPOIs();
        
        map.on('click', (e) => {
            const point = this.findNearestPoint(e.latlng.lat, e.latlng.lng);
            if (point) {
                this.openPointModal(point);
            }
        });

        map.on('moveend', () => {
            this.fetchPOIs();
        });
    },

    async fetchPOIs() {
        if (!map) return;
        
        poiMarkers.forEach(m => map.removeLayer(m));
        poiMarkers = [];
        
        const bounds = map.getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        
        const swWgs = gcj02ToWgs84(southWest.lat, southWest.lng);
        const neWgs = gcj02ToWgs84(northEast.lat, northEast.lng);
        
        const overpassUrl = 'https://overpass-api.de/api/interpreter';
        const query = `
            [out:json][timeout:10];
            (
                node["amenity"]([${swWgs.lat},${swWgs.lng}],[${neWgs.lat},${neWgs.lng}]);
                node["tourism"]([${swWgs.lat},${swWgs.lng}],[${neWgs.lat},${neWgs.lng}]);
                node["historic"]([${swWgs.lat},${swWgs.lng}],[${neWgs.lat},${neWgs.lng}]);
                node["leisure"]([${swWgs.lat},${swWgs.lng}],[${neWgs.lat},${neWgs.lng}]);
                node["natural"="peak"]([${swWgs.lat},${swWgs.lng}],[${neWgs.lat},${neWgs.lng}]);
                node["name"]([${swWgs.lat},${swWgs.lng}],[${neWgs.lat},${neWgs.lng}])["place"];
            );
            out center;
        `;
        
        try {
            const response = await fetch(overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: query
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            data.elements.forEach(element => {
                if (element.type === 'node' && element.tags && element.tags.name) {
                    const iconType = this.getPOIIconType(element.tags);
                    const gcj = wgs84ToGcj02(element.lat, element.lon);
                    const icon = L.divIcon({
                        className: 'poi-marker',
                        html: `<div class="poi-marker-inner ${iconType}">
                            <i data-lucide="${this.getPOIIconName(element.tags)}"></i>
                        </div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                    });
                    
                    const marker = L.marker([gcj.lat, gcj.lng], { icon })
                        .addTo(map)
                        .bindPopup(`<b>${element.tags.name}</b>`);
                    
                    poiMarkers.push(marker);
                }
            });
            
            createIcons({ icons });
        } catch (e) {
            console.warn('Fetching POIs failed:', e);
        }
    },

    getPOIIconType(tags) {
        if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'poi-food';
        if (tags.amenity === 'shop') return 'poi-shop';
        if (tags.tourism === 'attraction' || tags.tourism === 'museum') return 'poi-tourism';
        if (tags.historic) return 'poi-historic';
        if (tags.leisure === 'park') return 'poi-park';
        if (tags.natural === 'peak') return 'poi-peak';
        if (tags.place === 'city' || tags.place === 'town') return 'poi-city';
        return 'poi-default';
    },

    getPOIIconName(tags) {
        if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'utensils';
        if (tags.amenity === 'shop') return 'shopping-bag';
        if (tags.tourism === 'attraction') return 'camera';
        if (tags.tourism === 'museum') return 'landmark';
        if (tags.historic) return 'castle';
        if (tags.leisure === 'park') return 'trees';
        if (tags.natural === 'peak') return 'mountain';
        if (tags.place === 'city' || tags.place === 'town') return 'map-pin';
        return 'info';
    },

    showLocation() {
        const statusEl = document.getElementById('location-status');
        
        if (!navigator.geolocation) {
            statusEl.innerHTML = '<i data-lucide="alert-circle"></i> 不支持定位';
            statusEl.classList.add('error');
            return;
        }

        navigator.geolocation.watchPosition(
            (position) => {
                currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                
                const gcj = wgs84ToGcj02(position.coords.latitude, position.coords.longitude);
                
                statusEl.innerHTML = '<i data-lucide="map-pin"></i> 已定位';
                statusEl.classList.remove('error');
                statusEl.classList.add('success');
                
                if (map) {
                    map.setView([gcj.lat, gcj.lng], 16);
                    
                    if (userMarker) {
                        map.removeLayer(userMarker);
                    }
                    
                    const userIcon = L.divIcon({
                        className: 'custom-user-marker',
                        html: '<div class="user-marker-inner"><i data-lucide="user"></i></div>',
                        iconSize: [40, 40],
                        iconAnchor: [20, 20]
                    });
                    userMarker = L.marker([gcj.lat, gcj.lng], { icon: userIcon })
                        .addTo(map)
                        .bindPopup('您的位置');
                }
                
                this.updateDistances();
            },
            (error) => {
                console.error('定位失败:', error);
                let msg = '定位失败';
                if (error.code === 1) msg = '请允许定位权限';
                else if (error.code === 2) msg = '无法获取位置';
                else if (error.code === 3) msg = '定位超时';
                
                statusEl.innerHTML = `<i data-lucide="alert-circle"></i> ${msg}`;
                statusEl.classList.add('error');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    },

    addPointMarkers() {
        if (!map) return;
        
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        
        circleLayers.forEach(c => map.removeLayer(c));
        circleLayers = [];

        explorationPoints.forEach(point => {
            const isNearby = this.isNearby(point);
            const gcj = wgs84ToGcj02(point.latitude, point.longitude);
            
            const iconColor = isNearby ? '#4CAF50' : '#FF5722';
            const icon = L.divIcon({
                className: 'custom-point-marker',
                html: `<div class="point-marker-inner ${isNearby ? 'nearby' : ''}" style="background:${iconColor}">
                    <i data-lucide="map-pin"></i>
                </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([gcj.lat, gcj.lng], { icon })
                .addTo(map)
                .bindPopup(`<b>${point.name}</b><br>${point.description}`);

            marker.on('click', () => {
                this.openPointModal(point);
            });

            markers.push(marker);

            const circle = L.circle([gcj.lat, gcj.lng], {
                radius: point.radius_meters,
                color: isNearby ? '#4CAF50' : '#FF5722',
                fillColor: isNearby ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 87, 34, 0.1)',
                fillOpacity: 0.1,
                weight: 2,
                dashArray: '5, 5'
            }).addTo(map);
            
            circleLayers.push(circle);
        });
        
        createIcons({ icons });
    },

    isNearby(point) {
        if (!currentLocation) return false;
        
        const distance = this.calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            point.latitude,
            point.longitude
        );
        
        return distance <= point.radius_meters;
    },

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    toRad(deg) {
        return deg * (Math.PI / 180);
    },

    updateDistances() {
        explorationPoints.forEach(point => {
            if (currentLocation) {
                point.distance = this.calculateDistance(
                    currentLocation.lat,
                    currentLocation.lng,
                    point.latitude,
                    point.longitude
                );
            } else {
                point.distance = null;
            }
        });
        
        this.updatePointList();
        this.addPointMarkers();
    },

    findNearestPoint(lat, lng) {
        let nearest = null;
        let minDist = Infinity;
        
        explorationPoints.forEach(point => {
            const dist = this.calculateDistance(lat, lng, point.latitude, point.longitude);
            if (dist < minDist) {
                minDist = dist;
                nearest = point;
            }
        });
        
        if (nearest && minDist > (nearest.radius_meters || 50) * 2) {
            return null;
        }
        
        return nearest;
    },

    updatePointList() {
        const listEl = document.getElementById('explore-point-list');
        const countEl = document.getElementById('point-count');
        
        countEl.textContent = explorationPoints.length;

        if (explorationPoints.length === 0) {
            listEl.innerHTML = '<div class="explore-loading"><i data-lucide="map"></i> 暂无探索点</div>';
            return;
        }

        const sortedPoints = [...explorationPoints].sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });

        listEl.innerHTML = sortedPoints.map(point => {
            const isNearby = this.isNearby(point);
            const distText = point.distance !== null 
                ? `${Math.round(point.distance)}m` 
                : '未知';
            
            return `
                <div class="explore-point-card ${isNearby ? 'nearby' : ''}" 
                     onclick="window.openExploreModal(${point.id})">
                    <div class="point-icon">
                        <i data-lucide="map-pin"></i>
                    </div>
                    <div class="point-info">
                        <div class="point-name">${point.name}</div>
                        <div class="point-desc">${point.description || '暂无描述'}</div>
                    </div>
                    <div class="point-distance">${distText}</div>
                </div>
            `;
        }).join('');
        
        createIcons({ icons });
    },

    openPointModal(point) {
        selectedPoint = point;
        
        document.getElementById('explore-modal-title').textContent = point.name;
        document.getElementById('explore-modal-desc').textContent = point.description || '暂无描述';
        document.getElementById('explore-modal-pool').textContent = point.pool_name || '未设置';
        document.getElementById('explore-modal-remaining').textContent = point.daily_limit;
        
        const distEl = document.getElementById('explore-distance');
        const distInfo = document.getElementById('distance-info');
        
        if (point.distance !== null) {
            distEl.textContent = `${Math.round(point.distance)}米`;
            distInfo.classList.toggle('near', point.distance <= point.radius_meters);
        } else {
            distEl.textContent = '未知';
            distInfo.classList.remove('near');
        }
        
        const btn = document.getElementById('btn-explore');
        const isNearby = this.isNearby(point);
        btn.disabled = !isNearby;
        
        if (isNearby) {
            btn.innerHTML = '<i data-lucide="search"></i><span>开始探索</span>';
            btn.classList.remove('disabled');
        } else {
            btn.innerHTML = '<i data-lucide="navigation"></i><span>距离太远</span>';
            btn.classList.add('disabled');
        }
        
        createIcons({ icons });
        document.getElementById('explore-modal').style.display = 'flex';
    },

    async doExplore() {
        if (!selectedPoint || !currentLocation) return;
        
        const btn = document.getElementById('btn-explore');
        btn.disabled = true;
        
        try {
            const result = await explorePoint(
                selectedPoint.id,
                currentLocation.lat,
                currentLocation.lng
            );
            
            if (result.success) {
                closeExploreModal();
                this.showResultModal(true, result.reward_shells, result.reward_item_id);
                await updateGlobalShells();
                await this.loadData();
            } else {
                showToast(result.message, 'error');
                btn.disabled = false;
            }
        } catch (e) {
            console.error('探索失败:', e);
            btn.disabled = false;
        }
    },

    showResultModal(success, shells, itemId) {
        const modal = document.getElementById('explore-result-modal');
        const iconEl = document.getElementById('result-icon');
        const titleEl = document.getElementById('result-title');
        const shellsEl = document.getElementById('result-shells');
        const itemEl = document.getElementById('result-item');
        const itemNameEl = document.getElementById('result-item-name');
        
        modal.style.display = 'flex';
        
        if (success) {
            iconEl.className = 'result-icon success';
            iconEl.innerHTML = '<i data-lucide="check-circle"></i>';
            titleEl.textContent = '探索成功！';
            shellsEl.innerHTML = `<i data-lucide="coins"></i><span>获得 <strong>${shells}</strong> 果壳币</span>`;
            
            if (itemId) {
                const item = explorationPoints.find(p => p.reward_item_id === itemId);
                itemEl.style.display = 'flex';
                itemNameEl.textContent = '神秘物品';
            } else {
                itemEl.style.display = 'none';
            }
        } else {
            iconEl.className = 'result-icon error';
            iconEl.innerHTML = '<i data-lucide="x-circle"></i>';
            titleEl.textContent = '探索失败';
            shellsEl.style.display = 'none';
            itemEl.style.display = 'none';
        }
        
        createIcons({ icons });
    },

    attachEvents() {
        window.openExploreModal = (pointId) => {
            const point = explorationPoints.find(p => p.id === pointId);
            if (point) {
                this.openPointModal(point);
            }
        };
        
        window.closeExploreModal = () => {
            document.getElementById('explore-modal').style.display = 'none';
        };
        
        window.closeResultModal = () => {
            document.getElementById('explore-result-modal').style.display = 'none';
        };
        
        window.doExplore = () => {
            this.doExplore();
        };
        
        window.addEventListener('resize', () => {
            if (map) {
                map.invalidateSize();
            }
        });

        const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
        const sidebar = document.getElementById('explore-sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');

        const toggleSidebar = () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('open');
        };

        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', toggleSidebar);
        }

        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', toggleSidebar);
        }

        const manualLocateBtn = document.getElementById('btn-manual-locate');
        if (manualLocateBtn) {
            manualLocateBtn.addEventListener('click', () => {
                this.manualLocate();
            });
        }
    }
};