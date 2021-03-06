import { useQuery, useSubscription } from '@apollo/client';
import { Tabs, Typography, useTheme } from '@material-ui/core';
import { ButtonFilled } from 'litmus-ui';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import YAML from 'yaml';
import { StyledTab, TabPanel } from '../../../components/Tabs';
import {
  WORKFLOW_DETAILS_WITH_EXEC_DATA,
  WORKFLOW_LOGS,
} from '../../../graphql';
import { PodLog, PodLogRequest } from '../../../models/graphql/podLog';
import {
  ExecutionData,
  Workflow,
  WorkflowDataRequest,
} from '../../../models/graphql/workflowData';
import { RootState } from '../../../redux/reducers';
import { getProjectID } from '../../../utils/getSearchParams';
import useStyles from './styles';

interface ChaosDataVar {
  expPod: string;
  runnerPod: string;
  chaosNamespace: string;
}

interface LogsSwitcherProps extends PodLogRequest {}

const LogsSwitcher: React.FC<LogsSwitcherProps> = ({
  request: { clusterID, workflowRunID, podNamespace, podName, podType },
}) => {
  const theme = useTheme();
  const { type } = useSelector((state: RootState) => state.selectedNode);
  const [selectedTab, setSelectedTab] = useState(0);
  const handleChange = (event: React.ChangeEvent<{}>, newValue: number) => {
    setSelectedTab(newValue);
  };

  const classes = useStyles();
  const { t } = useTranslation();
  const projectID = getProjectID();

  const { data: workflow_data } = useQuery<Workflow, WorkflowDataRequest>(
    WORKFLOW_DETAILS_WITH_EXEC_DATA,
    {
      variables: {
        request: {
          projectID,
          workflowRunIDs: [workflowRunID],
        },
      },
    }
  );

  const workflow = workflow_data?.listWorkflowRuns.workflowRuns[0];

  const [chaosData, setChaosData] = useState<ChaosDataVar>({
    expPod: '',
    runnerPod: '',
    chaosNamespace: '',
  });

  useEffect(() => {
    if (workflow !== undefined) {
      const nodeData = (JSON.parse(workflow.executionData) as ExecutionData)
        .nodes[podName];
      if (nodeData && nodeData.chaosData)
        setChaosData({
          expPod: nodeData.chaosData.experimentPod,
          runnerPod: nodeData.chaosData.runnerPod,
          chaosNamespace: nodeData.chaosData.namespace,
        });
      else
        setChaosData({
          expPod: '',
          runnerPod: '',
          chaosNamespace: '',
        });
    }
  }, [workflow_data, podName]);

  const [chaosResult, setChaosResult] = useState('');

  useEffect(() => {
    if (workflow !== undefined) {
      const nodeData = (JSON.parse(workflow.executionData) as ExecutionData)
        .nodes[podName];
      if (nodeData?.chaosData?.chaosResult) {
        setChaosResult(YAML.stringify(nodeData.chaosData?.chaosResult));
      } else {
        setChaosResult('Chaos Result Not available');
      }
    }
  }, [workflow_data, podName]);

  const { data } = useSubscription<PodLog, PodLogRequest>(WORKFLOW_LOGS, {
    variables: {
      request: {
        clusterID,
        workflowRunID,
        podName,
        podNamespace,
        podType,
        expPod: chaosData.expPod,
        runnerPod: chaosData.runnerPod,
        chaosNamespace: chaosData.chaosNamespace,
      },
    },
  });

  const parsedChaosLog = (chaoslog: any) => {
    let log_str = '';
    if (Object.keys(chaoslog).length) {
      for (let i = 0; i <= Object.keys(chaoslog).length; i++) {
        const obj = Object.keys(chaoslog)[i];
        if (obj !== undefined) log_str += chaoslog[obj];
      }
      return log_str;
    }
    if (
      workflow !== undefined &&
      (JSON.parse(workflow.executionData) as ExecutionData).nodes[podName]
        .type === 'ChaosEngine'
    ) {
      return t('workflowDetailsView.nodeLogs.chaosLogs');
    }
    return '';
  };

  // Function to download the logs
  const downloadLogs = (logs: any, podName: string) => {
    const element = document.createElement('a');
    let chaosLogs = '';
    try {
      chaosLogs = parsedChaosLog(logs.chaosLogs);
    } catch {
      chaosLogs = 'Chaos Logs unavailable';
    }
    const file = new Blob([logs?.mainLogs, chaosLogs], {
      type: 'text/txt',
    });
    element.href = URL.createObjectURL(file);
    element.download = `${podName}.txt`;
    document.body.appendChild(element);
    element.click();
  };

  const parseLogs = (logs: string) => {
    try {
      const podLogs = JSON.parse(logs);
      return (
        <div data-cy="LogsWindow">
          <div>
            {workflow !== undefined &&
            JSON.parse(workflow?.executionData).nodes[podName].type ===
              'ChaosEngine' ? (
              <ButtonFilled
                onClick={() => {
                  downloadLogs(podLogs, podName);
                }}
                className={classes.downloadLogsBtn}
              >
                <Typography>
                  <img src="./icons/download-logs.svg" alt="download logs" />{' '}
                  {t('workflowDetailsView.logs')}
                </Typography>
              </ButtonFilled>
            ) : (
              <></>
            )}
            {podLogs?.mainLogs !== null && podLogs?.mainLogs !== '' ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                <Typography className={classes.text}>
                  {podLogs?.mainLogs}
                </Typography>
              </div>
            ) : (
              <Typography className={classes.text}>
                {t('workflowDetailsView.nodeLogs.mainLogs')}
              </Typography>
            )}
          </div>
          <div>
            {podLogs?.chaosLogs && (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                <Typography className={classes.text}>
                  {parsedChaosLog(podLogs.chaosLogs)}
                </Typography>
              </div>
            )}
          </div>
        </div>
      );
    } catch {
      return (
        <Typography className={classes.text}>
          {t('workflowDetailsView.nodeLogs.couldNot')}
        </Typography>
      );
    }
  };

  useEffect(() => {
    if (type !== 'ChaoEngine') setSelectedTab(0);
  }, [type]);

  return (
    <>
      <div className={classes.tabBar}>
        <Tabs
          value={selectedTab}
          onChange={handleChange}
          TabIndicatorProps={{
            style: {
              backgroundColor: theme.palette.highlight,
            },
          }}
        >
          <StyledTab label="Logs" />
          {type === 'ChaosEngine' && <StyledTab label="Chaos Results" />}
        </Tabs>
      </div>
      <TabPanel value={selectedTab} index={0} style={{ height: '100%' }}>
        <div className={classes.logs}>
          {data !== undefined ? (
            <div>{parseLogs(data.getPodLog.log)}</div>
          ) : (
            <Typography className={classes.text} variant="h5">
              {t('workflowDetailsView.nodeLogs.fetching')}
            </Typography>
          )}
        </div>
      </TabPanel>
      {type === 'ChaosEngine' && (
        <TabPanel value={selectedTab} index={1} style={{ height: '100%' }}>
          <div className={classes.logs}>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              <Typography
                data-cy="ChaosResultTypography"
                className={classes.text}
              >
                {chaosResult}
              </Typography>
            </div>
          </div>
        </TabPanel>
      )}
    </>
  );
};

export default LogsSwitcher;
