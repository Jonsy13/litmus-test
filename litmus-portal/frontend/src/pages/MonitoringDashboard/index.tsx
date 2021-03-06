import { useApolloClient, useQuery, useSubscription } from '@apollo/client';
import {
  IconButton,
  Menu,
  MenuItem,
  Typography,
  useTheme,
} from '@material-ui/core';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import { BrushPostitionProps, ButtonFilled, ButtonOutlined } from 'litmus-ui';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import BackButton from '../../components/Button/BackButton';
import Loader from '../../components/Loader';
import Wrapper from '../../containers/layouts/Wrapper';
import { GET_DASHBOARD, VIEW_DASHBOARD } from '../../graphql';
import {
  PanelNameAndID,
  ParsedChaosEventPrometheusData,
  QueryMapForPanelGroup,
  RangeType,
  SelectedDashboardInformation,
} from '../../models/dashboardsData';
import {
  GetDashboard,
  GetDashboardRequest,
  GetDashboardResponse,
  PanelGroupResponse,
  PanelResponse,
} from '../../models/graphql/dashboardsDetails';
import {
  ViewDashboard,
  ViewDashboardInput,
} from '../../models/graphql/prometheus';
import useActions from '../../redux/actions';
import * as DashboardActions from '../../redux/actions/dashboards';
import { history } from '../../redux/configureStore';
import { RootState } from '../../redux/reducers';
import { getProjectID } from '../../utils/getSearchParams';
import {
  ChaosEventDataParserForPrometheus,
  DashboardMetricDataParserForPrometheus,
  generatePromQueries,
  getDashboardQueryMap,
} from '../../utils/promUtils';
import ChaosAccordion from '../../views/Observability/MonitoringDashboard/ChaosAccordion';
import DataSourceInactiveModal from '../../views/Observability/MonitoringDashboard/DataSourceInactiveModal';
import InfoDropdown from '../../views/Observability/MonitoringDashboard/InfoDropdown';
import DashboardPanelGroup from '../../views/Observability/MonitoringDashboard/PanelAndGroup/PanelGroup';
import ToolBar from '../../views/Observability/MonitoringDashboard/ToolBar';
import TopNavButtons from '../../views/Observability/MonitoringDashboard/TopNavButtons';
import {
  ACTIVE,
  DEFAULT_REFRESH_RATE,
  DEFAULT_RELATIVE_TIME_RANGE,
  INVALID_DATE,
  INVALID_REFRESH_RATE,
  INVALID_RELATIVE_TIME_RANGE,
  PROMETHEUS_ERROR_QUERY_RESOLUTION_LIMIT_REACHED,
  TIME_DEVIATION_THRESHOLD_FOR_CONTROL_STACK_OBJECTS,
} from './constants';
import useStyles from './styles';

interface PromData {
  chaosEventData: ParsedChaosEventPrometheusData;
  panelGroupQueryMap: QueryMapForPanelGroup[];
}

const DashboardPage: React.FC = () => {
  const { palette } = useTheme();
  const classes = useStyles();
  const { t } = useTranslation();
  const apolloClient = useApolloClient();
  const dashboard = useActions(DashboardActions);
  const lineGraph: string[] = palette.graph.line;
  const areaGraph: string[] = palette.graph.area;
  const projectID = getProjectID();
  const selectedDashboard = useSelector(
    (state: RootState) => state.selectDashboard
  );
  const [selectedDashboardInformation, setSelectedDashboardInformation] =
    React.useState<SelectedDashboardInformation>({
      id: selectedDashboard.selectedDashboardID,
      name: '',
      typeName: '',
      typeID: '',
      agentID: selectedDashboard.selectedAgentID,
      agentName: '',
      urlToIcon: '',
      information: '',
      chaosEventQueryTemplate: '',
      chaosVerdictQueryTemplate: '',
      applicationMetadataMap: [],
      dashboardListForAgent: [],
      metaData: undefined,
      closedAreaQueryIDs: [],
      dashboardKey: 'Default',
      panelNameAndIDList: [],
      dataSourceURL: '',
      dataSourceID: '',
      dataSourceName: '',
      promQueries: [],
      range: {
        startDate: INVALID_DATE,
        endDate: INVALID_DATE,
      },
      relativeTime: DEFAULT_RELATIVE_TIME_RANGE,
      refreshInterval: DEFAULT_REFRESH_RATE,
      timeControlStack: [],
    });
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [dataSourceStatus, setDataSourceStatus] =
    React.useState<string>(ACTIVE);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) =>
    setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const [centralBrushPosition, setCentralBrushPosition] =
    React.useState<BrushPostitionProps>();
  const [centralAllowGraphUpdate, setCentralAllowGraphUpdate] =
    React.useState(true);
  const [isInfoOpen, setIsInfoOpen] = React.useState<Boolean>(false);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [showPromQueryResponseLoader, setShowPromQueryResponseLoader] =
    React.useState<boolean>(true);
  const [selectedPanels, setSelectedPanels] = React.useState<string[]>([]);
  const [selectedApplications, setSelectedApplications] = React.useState<
    string[]
  >([]);
  const [selectedEvents, setSelectedEvents] = React.useState<string[]>([]);
  const [reFetch, setReFetch] = React.useState<boolean>(false);
  const [reFetching, setReFetching] = React.useState<boolean>(false);
  const [promData, setPromData] = React.useState<PromData>({
    chaosEventData: {
      chaosData: [],
      chaosEventDetails: [],
    },
    panelGroupQueryMap: [],
  });

  const {
    data: dashboards,
    loading: loadingDashboards,
    error: errorFetchingDashboards,
    refetch: refetchDashboards,
  } = useQuery<GetDashboard, GetDashboardRequest>(GET_DASHBOARD, {
    variables: {
      projectID,
      clusterID: selectedDashboard.selectedAgentID,
    },
    skip:
      selectedDashboard.selectedDashboardID === '' ||
      selectedDashboard.selectedAgentID === '',
    fetchPolicy: 'no-cache',
    onCompleted: () => {
      setIsLoading(false);
    },
    onError: () => {
      setIsLoading(false);
    },
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: dashboardQueries,
    loading: loadingDashboardQueries,
    error: errorFetchingDashboardQueries,
  } = useSubscription<ViewDashboard, ViewDashboardInput>(VIEW_DASHBOARD, {
    variables: {
      dashboardID: selectedDashboardInformation.id,
      promQueries: selectedDashboardInformation.promQueries,
      dashboardQueryMap: getDashboardQueryMap(
        selectedDashboardInformation.metaData?.panelGroups ?? []
      ),
      dataVariables: {
        url: selectedDashboardInformation.dataSourceURL,
        start: selectedDashboardInformation.range.startDate,
        end: selectedDashboardInformation.range.endDate,
        relativeTime: selectedDashboardInformation.relativeTime,
        refreshInterval: selectedDashboardInformation.refreshInterval,
      },
    },
    skip:
      loadingDashboards ||
      errorFetchingDashboards !== undefined ||
      selectedDashboardInformation.promQueries.length === 0 ||
      selectedDashboardInformation.metaData?.panelGroups.length === 0 ||
      selectedDashboardInformation.dataSourceURL === '' ||
      (selectedDashboardInformation.range.startDate === INVALID_DATE &&
        selectedDashboardInformation.range.endDate === INVALID_DATE &&
        selectedDashboardInformation.relativeTime ===
          INVALID_RELATIVE_TIME_RANGE),
    shouldResubscribe: () => {
      if (reFetch) {
        if (showPromQueryResponseLoader) {
          setReFetching(true);
        }
        setReFetch(false);
        return true;
      }
      return false;
    },
    fetchPolicy: 'no-cache',
    onSubscriptionData: (subscriptionUpdate) => {
      setPromData({
        chaosEventData: ChaosEventDataParserForPrometheus(
          subscriptionUpdate.subscriptionData?.data?.viewDashboard
            ?.annotationsResponse ?? [],
          areaGraph,
          selectedEvents
        ),
        panelGroupQueryMap: DashboardMetricDataParserForPrometheus(
          subscriptionUpdate.subscriptionData?.data?.viewDashboard
            ?.dashboardMetricsResponse ?? [],
          lineGraph,
          areaGraph,
          selectedDashboardInformation.closedAreaQueryIDs,
          selectedApplications
        ),
      });
      if (reFetching) {
        setReFetching(false);
      }
    },
    onSubscriptionComplete: () => {
      if (reFetching) {
        setReFetching(false);
      }
      if (showPromQueryResponseLoader) {
        setShowPromQueryResponseLoader(false);
      }
    },
  });

  useEffect(() => {
    if (
      dashboards &&
      dashboards.listDashboard &&
      dashboards.listDashboard.length
    ) {
      if (
        selectedDashboardInformation.id !==
        selectedDashboardInformation.dashboardKey
      ) {
        const selectedDashBoard: GetDashboardResponse =
          dashboards.listDashboard.filter((data) => {
            return data.dbID === selectedDashboardInformation.id;
          })[0];
        const selectedPanelNameAndIDList: PanelNameAndID[] = [];
        if (selectedDashBoard) {
          (selectedDashBoard.panelGroups ?? []).forEach(
            (panelGroup: PanelGroupResponse) => {
              (panelGroup.panels ?? []).forEach((panel: PanelResponse) => {
                selectedPanelNameAndIDList.push({
                  name: panel.panelName,
                  id: panel.panelID,
                });
              });
            }
          );
          setSelectedDashboardInformation({
            ...selectedDashboardInformation,
            dashboardListForAgent: dashboards.listDashboard,
            metaData: selectedDashBoard,
            closedAreaQueryIDs: (selectedDashBoard.panelGroups ?? [])
              .flatMap((panelGroup) =>
                panelGroup ? panelGroup.panels ?? [] : []
              )
              .flatMap((panel) => (panel ? panel.promQueries ?? [] : []))
              .filter((query) => query.closeArea)
              .map((query) => query.queryID),
            dashboardKey: selectedDashboardInformation.id,
            panelNameAndIDList: selectedPanelNameAndIDList,
            name: selectedDashBoard.dbName,
            typeName: selectedDashBoard.dbTypeName,
            typeID: selectedDashBoard.dbTypeID,
            agentName: selectedDashBoard.clusterName,
            urlToIcon: `./icons/${
              selectedDashBoard.dbTypeID.includes('custom')
                ? 'custom'
                : selectedDashBoard.dbTypeID
            }_dashboard.svg`,
            information: selectedDashBoard.dbInformation,
            chaosEventQueryTemplate: selectedDashBoard.chaosEventQueryTemplate,
            chaosVerdictQueryTemplate:
              selectedDashBoard.chaosVerdictQueryTemplate,
            applicationMetadataMap: selectedDashBoard.applicationMetadataMap,
            dataSourceURL: selectedDashBoard.dsURL,
            dataSourceID: selectedDashBoard.dsID,
            dataSourceName: selectedDashBoard.dsName,
            promQueries: generatePromQueries(
              selectedDashboardInformation.range,
              selectedDashBoard.panelGroups ?? [],
              selectedDashBoard.chaosEventQueryTemplate,
              selectedDashBoard.chaosVerdictQueryTemplate
            ),
          });
          setSelectedPanels(
            selectedPanelNameAndIDList.map((panel: PanelNameAndID) => panel.id)
          );
          setSelectedApplications([]);
          setPromData({
            ...promData,
            panelGroupQueryMap: [],
          });
          if (selectedDashBoard.dsHealthStatus !== ACTIVE) {
            setDataSourceStatus(selectedDashBoard.dsHealthStatus);
          }
        }
        setReFetch(true);
      }
    }
  }, [dashboards, selectedDashboardInformation.id]);

  useEffect(() => {
    if (
      (dashboardQueries?.viewDashboard?.dashboardMetricsResponse ?? []).length >
        0 &&
      selectedApplications.length > 0
    ) {
      setPromData({
        ...promData,
        panelGroupQueryMap: DashboardMetricDataParserForPrometheus(
          dashboardQueries?.viewDashboard?.dashboardMetricsResponse ?? [],
          lineGraph,
          areaGraph,
          selectedDashboardInformation.closedAreaQueryIDs,
          selectedApplications
        ),
      });
    }
  }, [selectedApplications]);

  useEffect(() => {
    if (
      (dashboardQueries?.viewDashboard?.annotationsResponse ?? []).length > 0 &&
      selectedEvents.length > 0
    ) {
      setPromData({
        ...promData,
        chaosEventData: ChaosEventDataParserForPrometheus(
          dashboardQueries?.viewDashboard?.annotationsResponse ?? [],
          areaGraph,
          selectedEvents
        ),
      });
    }
  }, [selectedEvents]);

  useEffect(() => {
    if (
      errorFetchingDashboardQueries &&
      errorFetchingDashboardQueries.message ===
        PROMETHEUS_ERROR_QUERY_RESOLUTION_LIMIT_REACHED
    ) {
      if (
        selectedDashboardInformation.refreshInterval !== INVALID_REFRESH_RATE
      ) {
        setSelectedDashboardInformation({
          ...selectedDashboardInformation,
          refreshInterval: INVALID_REFRESH_RATE,
        });
      }
    }
  }, [errorFetchingDashboardQueries]);

  return (
    <Wrapper>
      <div>
        {errorFetchingDashboards ||
          selectedDashboard.selectedDashboardID === '' ||
          (selectedDashboard.selectedAgentID === '' && <BackButton />)}
        {isLoading || loadingDashboards ? (
          <div className={classes.center}>
            <Loader />
            <Typography className={classes.loading}>
              {t('monitoringDashboard.monitoringDashboardPage.loadingText')}
            </Typography>
          </div>
        ) : errorFetchingDashboards ? (
          <div className={classes.center}>
            <Typography className={classes.error}>
              {t('monitoringDashboard.monitoringDashboardPage.errorText')}
            </Typography>
            <div className={classes.flexButtons}>
              <ButtonOutlined
                onClick={() => {
                  setIsLoading(true);
                  refetchDashboards();
                }}
                className={classes.flexButton}
                variant="highlight"
              >
                <Typography>
                  {t('monitoringDashboard.monitoringDashboardPage.tryAgain')}
                </Typography>
              </ButtonOutlined>
              <ButtonFilled
                onClick={() => history.goBack()}
                className={classes.flexButton}
                variant="error"
              >
                <Typography>
                  {t('monitoringDashboard.monitoringDashboardPage.goBack')}
                </Typography>
              </ButtonFilled>
            </div>
          </div>
        ) : (
          <div className={classes.root}>
            <div className={classes.button}>
              <BackButton />
            </div>

            <div className={classes.controlsDiv}>
              <Typography variant="h4" style={{ fontWeight: 500 }}>
                {`${selectedDashboardInformation.agentName} / `}
                <Typography
                  variant="h4"
                  display="inline"
                  style={{ fontStyle: 'italic' }}
                >
                  {selectedDashboardInformation.name}
                </Typography>
                <IconButton
                  aria-label="more"
                  aria-controls="long-menu"
                  aria-haspopup="true"
                  onClick={handleClick}
                  data-cy="browseDashboardListOptions"
                  className={classes.iconButton}
                >
                  <KeyboardArrowDownIcon
                    className={classes.dashboardSwitchIcon}
                  />
                </IconButton>
                <Menu
                  id="long-menu"
                  anchorEl={anchorEl}
                  keepMounted
                  open={open}
                  onClose={handleClose}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'left',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  getContentAnchorEl={null}
                  classes={{ paper: classes.menuList }}
                >
                  {selectedDashboardInformation.dashboardListForAgent.map(
                    (data: GetDashboardResponse) => {
                      return (
                        <MenuItem
                          key={`${data.dbID}-monitoringDashboard`}
                          value={data.dbID}
                          selected={
                            data.dbID === selectedDashboardInformation.id
                          }
                          onClick={() => {
                            dashboard.selectDashboard({
                              selectedDashboardID: data.dbID,
                            });
                            setSelectedDashboardInformation({
                              ...selectedDashboardInformation,
                              id: data.dbID,
                            });
                            setAnchorEl(null);
                          }}
                          className={classes.menuItem}
                        >
                          <div style={{ display: 'flex' }}>
                            <Typography
                              data-cy="switchDashboard"
                              className={classes.btnText}
                              variant="h5"
                            >
                              {data.dbName}
                            </Typography>
                          </div>
                        </MenuItem>
                      );
                    }
                  )}
                </Menu>
              </Typography>

              <TopNavButtons
                isInfoToggledState={isInfoOpen}
                switchIsInfoToggled={(toggleState: Boolean) =>
                  setIsInfoOpen(toggleState)
                }
                dashboardData={selectedDashboardInformation}
                dashboardTypeID={selectedDashboardInformation.typeID}
              />
            </div>
            {isInfoOpen && (
              <InfoDropdown
                dashboardConfigurationDetails={{
                  name: selectedDashboardInformation.name,
                  typeID: selectedDashboardInformation.typeID,
                  typeName: selectedDashboardInformation.typeName,
                  dataSourceName: selectedDashboardInformation.dataSourceName,
                  dataSourceURL: selectedDashboardInformation.dataSourceURL,
                  agentName: selectedDashboardInformation.agentName,
                }}
                metricsToBeShown={
                  selectedDashboardInformation.panelNameAndIDList
                }
                applicationsToBeShown={
                  selectedDashboardInformation.applicationMetadataMap
                }
                postPanelSelectionRoutine={(selectedPanelList: string[]) =>
                  setSelectedPanels(selectedPanelList)
                }
                postApplicationSelectionRoutine={(
                  selectedApplicationList: string[]
                ) => setSelectedApplications(selectedApplicationList)}
              />
            )}
            <ToolBar
              timeRange={selectedDashboardInformation.range}
              refreshInterval={selectedDashboardInformation.refreshInterval}
              handleRangeChange={(range: RangeType, relativeTime: number) => {
                let { refreshInterval } = selectedDashboardInformation;
                if (
                  range.startDate !== INVALID_DATE &&
                  range.endDate !== INVALID_DATE &&
                  relativeTime === INVALID_RELATIVE_TIME_RANGE &&
                  selectedDashboardInformation.refreshInterval !==
                    INVALID_REFRESH_RATE
                ) {
                  refreshInterval = INVALID_REFRESH_RATE;
                }
                setSelectedDashboardInformation({
                  ...selectedDashboardInformation,
                  range,
                  relativeTime,
                  refreshInterval,
                  promQueries: generatePromQueries(
                    range,
                    selectedDashboardInformation.metaData?.panelGroups ?? [],
                    selectedDashboardInformation.chaosEventQueryTemplate,
                    selectedDashboardInformation.chaosVerdictQueryTemplate
                  ),
                });
                setSelectedEvents([]);
                if (!showPromQueryResponseLoader) {
                  setShowPromQueryResponseLoader(true);
                }
                setReFetch(true);
              }}
              handleRefreshRateChange={(refreshRate: number) => {
                const { range } = selectedDashboardInformation;
                let { relativeTime } = selectedDashboardInformation;
                if (
                  refreshRate !== INVALID_REFRESH_RATE &&
                  selectedDashboardInformation.range.startDate !==
                    INVALID_DATE &&
                  selectedDashboardInformation.range.endDate !== INVALID_DATE &&
                  selectedDashboardInformation.relativeTime ===
                    INVALID_RELATIVE_TIME_RANGE
                ) {
                  range.startDate = INVALID_DATE;
                  range.endDate = INVALID_DATE;
                  relativeTime = DEFAULT_RELATIVE_TIME_RANGE;
                }
                setSelectedDashboardInformation({
                  ...selectedDashboardInformation,
                  refreshInterval: refreshRate,
                  range,
                  relativeTime,
                });
                if (showPromQueryResponseLoader) {
                  setShowPromQueryResponseLoader(false);
                }
                setReFetch(true);
              }}
              handleForceUpdate={() => {
                apolloClient.stop();
                apolloClient.resetStore();
                setSelectedDashboardInformation({
                  ...selectedDashboardInformation,
                  dashboardKey: 'Default',
                });
                setIsLoading(true);
                refetchDashboards();
              }}
            />
            <div
              className={classes.observabilityDiv}
              key={selectedDashboardInformation.dashboardKey}
            >
              <div className={classes.chaosTableSection}>
                <ChaosAccordion
                  dashboardKey={selectedDashboardInformation.dashboardKey}
                  isLoading={loadingDashboardQueries || reFetching}
                  chaosEventsToBeShown={
                    promData.chaosEventData.chaosEventDetails
                  }
                  postEventSelectionRoutine={(selectedEventNames: string[]) =>
                    setSelectedEvents(selectedEventNames)
                  }
                  dashboardID={selectedDashboardInformation.id}
                  dataSourceURL={selectedDashboardInformation.dataSourceURL}
                  chaosEventQueryTemplate={
                    selectedDashboardInformation.chaosEventQueryTemplate
                  }
                  chaosVerdictQueryTemplate={
                    selectedDashboardInformation.chaosVerdictQueryTemplate
                  }
                  refetchDashboardAndMetrics={() => {
                    setPromData({
                      ...promData,
                      chaosEventData: {
                        chaosData: [],
                        chaosEventDetails: [],
                      },
                    });
                    setSelectedEvents([]);
                    setSelectedDashboardInformation({
                      ...selectedDashboardInformation,
                      dashboardKey: 'Default',
                    });
                    if (!showPromQueryResponseLoader) {
                      setShowPromQueryResponseLoader(true);
                    }
                    setIsLoading(true);
                    refetchDashboards();
                  }}
                />
              </div>
              {(loadingDashboardQueries ||
                promData.panelGroupQueryMap.length === 0 ||
                reFetching) && (
                <div className={classes.center}>
                  <Loader />
                  <Typography className={classes.loading}>
                    {t(
                      'monitoringDashboard.monitoringDashboardPage.metricsLoadingText'
                    )}
                  </Typography>
                </div>
              )}
              {!loadingDashboardQueries &&
                promData.panelGroupQueryMap.length > 0 &&
                !reFetching &&
                selectedDashboardInformation.metaData &&
                selectedDashboardInformation.metaData.panelGroups.length > 0 &&
                selectedDashboardInformation.metaData.panelGroups.map(
                  (panelGroup: PanelGroupResponse, index) => (
                    <div
                      key={`${panelGroup.panelGroupID}-dashboardPage-div`}
                      data-cy="dashboardPanelGroup"
                    >
                      <DashboardPanelGroup
                        key={`${panelGroup.panelGroupID}-dashboardPage-component`}
                        centralAllowGraphUpdate={centralAllowGraphUpdate}
                        centralBrushPosition={centralBrushPosition}
                        handleCentralBrushPosition={(
                          newBrushPosition: BrushPostitionProps
                        ) => {
                          const newStart = Math.ceil(
                            (newBrushPosition.start.x as number) / 1000
                          );
                          const newEnd = Math.floor(
                            (newBrushPosition.end.x as number) / 1000
                          );
                          const range: RangeType = {
                            startDate: `${newStart}`,
                            endDate: `${newEnd}`,
                          };
                          const localTimeControlStack =
                            selectedDashboardInformation.timeControlStack;
                          const timeControlObjectFromHistory =
                            localTimeControlStack[0] ?? undefined;
                          if (
                            ((selectedDashboardInformation.range.startDate !==
                              INVALID_DATE &&
                              parseInt(
                                selectedDashboardInformation.range.startDate,
                                10
                              ) <= newStart &&
                              selectedDashboardInformation.range.endDate !==
                                INVALID_DATE &&
                              parseInt(
                                selectedDashboardInformation.range.endDate,
                                10
                              ) >= newEnd &&
                              parseInt(
                                selectedDashboardInformation.range.endDate,
                                10
                              ) -
                                parseInt(
                                  selectedDashboardInformation.range.startDate,
                                  10
                                ) -
                                (newEnd - newStart) >
                                TIME_DEVIATION_THRESHOLD_FOR_CONTROL_STACK_OBJECTS &&
                              selectedDashboardInformation.relativeTime ===
                                INVALID_RELATIVE_TIME_RANGE &&
                              selectedDashboardInformation.refreshInterval ===
                                INVALID_REFRESH_RATE) ||
                              (selectedDashboardInformation.relativeTime !==
                                INVALID_RELATIVE_TIME_RANGE &&
                                selectedDashboardInformation.range.startDate ===
                                  INVALID_DATE &&
                                selectedDashboardInformation.range.endDate ===
                                  INVALID_DATE)) &&
                            (timeControlObjectFromHistory
                              ? (timeControlObjectFromHistory.range
                                  .startDate !== INVALID_DATE &&
                                  parseInt(
                                    timeControlObjectFromHistory.range
                                      .startDate,
                                    10
                                  ) <= newStart &&
                                  timeControlObjectFromHistory.range.endDate !==
                                    INVALID_DATE &&
                                  parseInt(
                                    timeControlObjectFromHistory.range.endDate,
                                    10
                                  ) >= newEnd &&
                                  parseInt(
                                    timeControlObjectFromHistory.range.endDate,
                                    10
                                  ) -
                                    parseInt(
                                      timeControlObjectFromHistory.range
                                        .startDate,
                                      10
                                    ) -
                                    (newEnd - newStart) >
                                    TIME_DEVIATION_THRESHOLD_FOR_CONTROL_STACK_OBJECTS &&
                                  timeControlObjectFromHistory.relativeTime ===
                                    INVALID_RELATIVE_TIME_RANGE &&
                                  timeControlObjectFromHistory.refreshInterval ===
                                    INVALID_REFRESH_RATE) ||
                                (timeControlObjectFromHistory.range
                                  .startDate === INVALID_DATE &&
                                  timeControlObjectFromHistory.range.endDate ===
                                    INVALID_DATE &&
                                  timeControlObjectFromHistory.relativeTime !==
                                    INVALID_RELATIVE_TIME_RANGE &&
                                  timeControlObjectFromHistory.refreshInterval !==
                                    INVALID_REFRESH_RATE)
                              : true)
                          ) {
                            localTimeControlStack.push({
                              range: selectedDashboardInformation.range,
                              relativeTime:
                                selectedDashboardInformation.relativeTime,
                              refreshInterval:
                                selectedDashboardInformation.refreshInterval,
                            });
                            setSelectedDashboardInformation({
                              ...selectedDashboardInformation,
                              range,
                              refreshInterval: INVALID_REFRESH_RATE,
                              relativeTime: INVALID_RELATIVE_TIME_RANGE,
                              promQueries: generatePromQueries(
                                range,
                                selectedDashboardInformation.metaData
                                  ?.panelGroups ?? [],
                                selectedDashboardInformation.chaosEventQueryTemplate,
                                selectedDashboardInformation.chaosVerdictQueryTemplate
                              ),
                              timeControlStack: localTimeControlStack,
                            });
                            setSelectedEvents([]);
                            setReFetch(true);
                            setCentralAllowGraphUpdate(false);
                            setCentralBrushPosition(newBrushPosition);
                          } else if (timeControlObjectFromHistory) {
                            setSelectedDashboardInformation({
                              ...selectedDashboardInformation,
                              range: timeControlObjectFromHistory.range,
                              refreshInterval:
                                timeControlObjectFromHistory.refreshInterval,
                              relativeTime:
                                timeControlObjectFromHistory.relativeTime,
                              promQueries: generatePromQueries(
                                timeControlObjectFromHistory.range,
                                selectedDashboardInformation.metaData
                                  ?.panelGroups ?? [],
                                selectedDashboardInformation.chaosEventQueryTemplate,
                                selectedDashboardInformation.chaosVerdictQueryTemplate
                              ),
                              timeControlStack: [],
                            });
                            setSelectedEvents([]);
                            if (
                              timeControlObjectFromHistory.range.startDate !==
                                INVALID_DATE &&
                              timeControlObjectFromHistory.range.endDate !==
                                INVALID_DATE &&
                              timeControlObjectFromHistory.relativeTime ===
                                INVALID_RELATIVE_TIME_RANGE &&
                              timeControlObjectFromHistory.refreshInterval ===
                                INVALID_REFRESH_RATE
                            ) {
                              setReFetch(true);
                              setCentralAllowGraphUpdate(false);
                              setCentralBrushPosition({
                                start: {
                                  x:
                                    parseInt(
                                      timeControlObjectFromHistory.range
                                        .startDate,
                                      10
                                    ) * 1000,
                                },
                                end: {
                                  x:
                                    parseInt(
                                      timeControlObjectFromHistory.range
                                        .endDate,
                                      10
                                    ) * 1000,
                                },
                              });
                            } else {
                              setReFetch(true);
                              setCentralAllowGraphUpdate(true);
                              setCentralBrushPosition(undefined);
                            }
                          } else {
                            setSelectedDashboardInformation({
                              ...selectedDashboardInformation,
                              range: {
                                startDate: INVALID_DATE,
                                endDate: INVALID_DATE,
                              },
                              refreshInterval: DEFAULT_REFRESH_RATE,
                              relativeTime: DEFAULT_RELATIVE_TIME_RANGE,
                              promQueries: generatePromQueries(
                                {
                                  startDate: INVALID_DATE,
                                  endDate: INVALID_DATE,
                                },
                                selectedDashboardInformation.metaData
                                  ?.panelGroups ?? [],
                                selectedDashboardInformation.chaosEventQueryTemplate,
                                selectedDashboardInformation.chaosVerdictQueryTemplate
                              ),
                            });
                            setSelectedEvents([]);
                            setReFetch(true);
                            setCentralAllowGraphUpdate(true);
                            setCentralBrushPosition(undefined);
                          }
                          if (showPromQueryResponseLoader) {
                            setShowPromQueryResponseLoader(false);
                          }
                        }}
                        panelGroupID={panelGroup.panelGroupID}
                        panelGroupName={panelGroup.panelGroupName}
                        panels={panelGroup.panels ?? []}
                        selectedPanels={selectedPanels}
                        metricDataForGroup={
                          promData.panelGroupQueryMap[index]
                            ? promData.panelGroupQueryMap[index]
                                .metricDataForGroup
                            : []
                        }
                        chaosData={promData.chaosEventData.chaosData}
                      />
                    </div>
                  )
                )}
            </div>
          </div>
        )}
      </div>
      {dataSourceStatus !== ACTIVE && (
        <DataSourceInactiveModal
          dataSourceStatus={dataSourceStatus}
          dashboardID={selectedDashboardInformation.id}
        />
      )}
    </Wrapper>
  );
};

export default DashboardPage;
