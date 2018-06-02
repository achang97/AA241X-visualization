/// app.js
import DeckGL, {IconLayer, PathLayer, ArcLayer} from 'deck.gl';
import ReactMapGL from 'react-map-gl';
import {render} from 'react-dom';
import React, {Component} from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';

import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

import { Icon, Menu, Button, Sidebar, Segment, Checkbox, Loader, Tab, Table, } from 'semantic-ui-react';
import 'semantic-ui-css/semantic.min.css';

import axios from 'axios';

// Set your mapbox access token here
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYWNoYW5nOTciLCJhIjoiY2pmaWhzdmg3MDZwbjJ6bXFzdWtocGFubiJ9.awkkV7BUJwQCkm4-8UWCtg';

// preset defined colors
// red, blue, green, teal, orange, pink
const COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255], [255, 128, 0], [255, 0, 255]];


class App extends Component {

  constructor(props) {
    super(props);

    // bind functions
    this._toggleSidebar = this._toggleSidebar.bind(this);
    this._toggleRotate = this._toggleRotate.bind(this);
    this._createIconLayer = this._createIconLayer.bind(this);
    this._onViewportChange = this._onViewportChange.bind(this);
    this._resize = this._resize.bind(this);
    this._animate = this._animate.bind(this);

    // used to control fps
    this.then = new Date().getTime();

    this.TEAM_COLORS = {};
    axios.get('http://localhost:8000/getTeams').then(response => {
      // store in color map
      response.data.teams.forEach((currTeam, i) => {
        this.TEAM_COLORS[currTeam.id] = COLORS[i];
      })
    });

    // get vertiport locations
    axios.get('http://localhost:8000/getVertiportLocations').then(response => {
      // create icon layer for vertiports
      const vertiportLayerData = response.data.ports.map((currPort) => {
        return {icon: 'vertiport', size: 100, ...currPort};
      });  

      // update state
      this.setState({vertiportData: vertiportLayerData});
    });

    const defaultViewport = {
      longitude: -122.176128,
      latitude: 37.42240, 
      zoom: 16.5,
      minZoom: 15.5,
      maxZoom: 18,
      pitch: 0,
      bearing: 0,
      mapStyle: "mapbox://styles/mapbox/satellite-v9"
    };

    this.state = {
      viewport: {
        ...defaultViewport,
        width: 500,
        height: 500
      },
      rotate: false,
      sidebarOpen: false,
    };
  }

  _createIconLayer(id, data, getColor=undefined, updateTriggers={}) {
    const sizeScaleFactor = Math.pow(this.state.viewport.zoom / 16.5, 10);

    // add getColor when that is determined
    return new IconLayer({
      id: id,
      data: data,
      iconAtlas: 'images/image-atlas-3.png',
      iconMapping: {
        drone: {x: 0, y: 0, width: 276, height: 276, mask: true},
        vertiport: {x: 276, y: 0, width: 276, height: 276, mask: true},
        virtual_drone: {x: 552, y: 0, width: 276, height: 276, mask: true}
      },
      getSize: icon => icon.size * sizeScaleFactor, // scale with the zoom factor
      getPosition: icon => [icon.longitude, icon.latitude, icon.altitude],
      fp64: true,
      getColor: getColor || (icon => icon.color || [0, 0, 0, 255]), 
      updateTriggers: {
        getSize: [this.state.viewport.zoom],
        ...updateTriggers
      }
    });
  }

  componentDidMount() {
    window.addEventListener('resize', this._resize);
    this._animate(); // default 60 fps
    this._resize();
  }

  componentWillUnmount() {
    if (this._animationFrame) {
      window.cancelAnimationFrame(this._animationFrame);
    }
  }

  _resize() {
    this._onViewportChange({
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  _onViewportChange(viewport) {
    this.setState({
      viewport: {...this.state.viewport, ...viewport}
    });
  }  

  _animate() {
    this._animationFrame = window.requestAnimationFrame(this._animate);

    // again, Date.now() if it's available
    const now = new Date().getTime();
    const delta = now - this.then;

    // custom fps
    const fps = 30;
    const interval = 1000 / fps;
    if (delta < interval) {
       return;
    }

    // update time
    // now - (delta % interval) is an improvement over just 
    // using then = now, which can end up lowering overall fps
    this.then = now - (delta % interval);

    // rotate if selected
    const rotateIncrement = 0.1;
    const newBearing = this.state.rotate ? (this.state.viewport.bearing + rotateIncrement) % 360 : 
      this.state.viewport.bearing;

    const unassignedRequestPromise = axios.get('http://localhost:8000/getUnassignedRequests');
    const assignedRequestPromise = axios.get('http://localhost:8000/getAssignedRequests');
    const dronePromise = axios.get('http://localhost:8000/getDroneInfo');
    const requestCountPromise = axios.get('http://localhost:8000/getRequestCounts');

    Promise.all([unassignedRequestPromise, assignedRequestPromise, dronePromise, requestCountPromise]).then(values => {
      let requestData = values[0].data.requests.map(currRequest => {
        return {'color': [0, 0, 0], ...currRequest}
      });

      requestData = requestData.concat(values[1].data.requests.map(currRequest => {
        return {'color': this.TEAM_COLORS[currRequest.team_id], ...currRequest}
      }))

      const droneData = values[2].data.states.map(currDrone => {
        return {icon: currDrone.is_physical ? 'drone' : 'virtual_drone', size: 75, ...currDrone};
      })

      const requestCountData = values[3].data.counts;

      this.setState({
        requestData: requestData,
        droneData: droneData,
        requestCountData: requestCountData,
        viewport: {...this.state.viewport, bearing: newBearing} 
      });          
    }).catch(e => {
      // do some error checking here
      console.log(e);
    })
  }

  _toggleSidebar() {
    this.setState({
      sidebarOpen: !this.state.sidebarOpen
    });
  }

  _toggleRotate() {
    this.setState({
      rotate: !this.state.rotate
    });    
  }

  _numberToColorHsl(count, maxCount) {
    /**
     * Converts an HSL color value to RGB. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
     * Assumes h, s, and l are contained in the set [0, 1] and
     * returns r, g, and b in the set [0, 255].
     *
     * @param   {number}  h       The hue
     * @param   {number}  s       The saturation
     * @param   {number}  l       The lightness
     * @return  {Array}           The RGB representation
     */
    function hslToRgb(h, s, l){
      var r, g, b;

      if(s == 0){
          r = g = b = l; // achromatic
      }else{
          var hue2rgb = function hue2rgb(p, q, t){
              if(t < 0) t += 1;
              if(t > 1) t -= 1;
              if(t < 1/6) return p + (q - p) * 6 * t;
              if(t < 1/2) return q;
              if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
              return p;
          }

          var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          var p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
      }

      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // as the function expects a value between 0 and 1, and red = 0° and green = 120°
    // we convert the input to the appropriate hue value
    count = Math.min(count, maxCount);
    const i = (1 - count / maxCount) * 100;

    var hue = i * 1.2 / 360;
    
    // we convert hsl to rgb (saturation 100%, lightness 50%)
    var rgb = hslToRgb(hue, 1, .5);

    // we format to css value and return
    return rgb;
  }

  metricsTable = (title, headers, data, keys) => {
    return (
      <div className="metrics-section">
        <h1> {title} </h1>
        <Table>
          <Table.Header>
            <Table.Row>
              {headers.map(header => (
                <Table.HeaderCell> {header} </Table.HeaderCell>
                ))
              }
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data && data.map(currData => (
              <Table.Row>
                {keys.map(key => (
                   <Table.Cell> {currData[key]} </Table.Cell>
                  ))
                }
              </Table.Row>
              ))
            }
          </Table.Body>
        </Table>
      </div>
    );
  }

  metricsView = () => {
    const sections = [
      {
        title: 'Unassigned Requests',
        headers: ['Request ID', 'Time Requested', 'From Port', 'To Port'],
        data: this.state.requestData && this.state.requestData.filter(request => request.state !== 'ASSIGNED'),
        keys: ['request_id', 'time_requested', 'from_port', 'to_port'],
      }, {
        title: 'Assigned Requests',
        headers: ['Request ID', 'Time Requested', 'From Port', 'To Port', 'Assigned Team'],
        data: this.state.requestData && this.state.requestData.filter(request => request.state === 'ASSIGNED'),
        keys: ['request_id', 'time_requested', 'from_port', 'to_port', 'team_id'],
      }, {
        title: 'Current Drone Locations',
        headers: ['Drone ID', 'Team ID', 'Time Stamp', 'Latitude', 'Longitude', 'Altitude', 'Velocity',
          '# Passengers', 'Battery Left', 'Request #'],
        data: this.state.droneData,
        keys: ['drone_id', 'team_id', 'time_stamp', 'latitude', 'longitude', 'altitude', 
          'velocity', 'k_passengers', 'battery_left', 'fulfilling'],
      }, {
        title: 'Unassigned Port Request Summary',
        headers: ['From Port', 'To Port', '# Unassigned Requests'],
        data: this.state.requestCountData,
        keys: ['from_port_name', 'to_port_name', 'count'],
      }, {
        title: 'Ports',
        headers: ['Name', 'Latitude', 'Longitude', 'Altitude'],
        data: this.state.vertiportData,
        keys: ['port_name', 'latitude', 'longitude', 'altitude'], 
      }, {
        title: 'Teams',
        headers: ['Name', 'Drone Color'],
        data: Object.entries(this.TEAM_COLORS).sort().map(([team_id, color]) => ({
          team_id: team_id,
          color: 
            <div style={{backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`}}>
              [{color[0]}, {color[1]}, {color[2]}]
            </div>
        })),
        keys: ['team_id', 'color'], 
      }, 
    ];


    return (
      <div>
        {sections.map(section => (
          <div key={section.title}>
            {this.metricsTable(section.title, section.headers, section.data, section.keys)}
          </div>))
        }
      </div>
    );
  }


  satelliteView = () => {
    // create icon layer for drones
    const droneLayer = this._createIconLayer('drone-layer', this.state.droneData, drone => this.TEAM_COLORS[drone.team_id] || [0, 0, 0]);


    let counts = {};
    this.state.requestCountData.forEach(info => {
      counts[info.from_port] = info.count;
    })

    const vertiportLayer = this._createIconLayer('vertiport-layer', this.state.vertiportData, port => {
      let currCount = counts[port.port_id] || 0;
      return this._numberToColorHsl(currCount, 5);
    }, {getColor: [this.state.requestCountData]});

    // TO DO:
    // figure out how to draw lines between nodes with drone in the center
    // figure out indication of directionality


    // // dash to show requested paths, solid to show fulfilled?
    // const requestLayer = new PathLayer({
    //   id: 'path-layer',
    //   data: this.state.requestData,
    //   fp64: true,
    //   getPath: (object, index) => [[object.from_longitude, object.from_latitude, object.from_altitude], [object.to_longitude, object.to_latitude, object.to_altitude]],
    // });

    const requestLayer = new ArcLayer({
      id: 'arc-layer',
      data: this.state.requestData,
      fp64: true,
      strokeWidth: 5,
      getSourcePosition: object => [object.from_longitude, object.from_latitude, object.from_altitude],
      getTargetPosition: object => [object.to_longitude, object.to_latitude, object.to_altitude],
      getSourceColor: object => object.color.concat([75])
    });

    return (
      <div>
        <Menu attached='top'>
          <Button basic icon onClick={this._toggleSidebar}>
            <Icon name='content' />
          </Button>
        </Menu>

        <Sidebar.Pushable as={Segment} className="main-view">
          <Sidebar as={Menu} animation='push' width='wide' visible={this.state.sidebarOpen} icon='labeled' vertical>
            <Menu.Item name='pitch-slider'>
              <Slider max={60} step={1} onChange={(pitch) => this._onViewportChange({pitch: pitch})}/>
              Pitch: {this.state.viewport.pitch}
            </Menu.Item>
            <Menu.Item name='bearing-slider'>
              <Slider max={359} step={1} value={this.state.viewport.bearing} onChange={(bearing) => this._onViewportChange({bearing: bearing})}/>
              Bearing: {Math.floor(this.state.viewport.bearing)}
            </Menu.Item> 
            <Menu.Item name='bearing-slider'>
              <Checkbox toggle checked={this.state.rotate} onChange={this._toggleRotate}/>
              <div> Rotate: {this.state.rotate ? "on" : "off"} </div>
            </Menu.Item>                     
          </Sidebar>
          <Sidebar.Pusher>
            <ReactMapGL {...this.state.viewport} mapboxApiAccessToken={MAPBOX_ACCESS_TOKEN} onViewportChange={this._onViewportChange}>
              <DeckGL {...this.state.viewport} layers={[
                vertiportLayer,
                droneLayer,
                requestLayer
              ]} />
            </ReactMapGL>
          </Sidebar.Pusher>
        </Sidebar.Pushable>
      </div>   
    );   
  }


  render() {
    const panes = [
      {
        menuItem: 'Satellite',
        render: () => 
          <Tab.Pane className="pane">
            {this.satelliteView()}
          </Tab.Pane>
      }, {
        menuItem: 'Metrics',
        render: () => 
          <Tab.Pane className="pane">
            {this.metricsView()}
          </Tab.Pane>
      },
    ];


    return (
      <Tab defaultActiveIndex={1} className="menu" menu={{ inverted: true }} panes={panes} />
    );
  }
}

// TO DO:
// [x] location of vertiports
// [x] location of real / virtual drones
//   [x] different icon for real virtual
//   [x] colored by team #
// [x] arrows from / to vertiport 
//   [x] expected and active trips, colored by team (black = unassigned)
// ---------------
// [x] small red dots / number of waiting at any vertiport or change color of vertiport icon
// depending on # of trips waiting to start
// [] "trails" for drones
// [] panel with teams and current cumulative revenue
// [] automating camera movement


render(<App/>, document.getElementById('root'));
