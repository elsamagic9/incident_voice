"""Explicit Kubernetes adapter: live failures never fall back to simulation."""
import json
import re
import shutil
import subprocess
from app.core.config import settings
from app.core.session import SessionLocal

class KubernetesAdapter:
    def __init__(self):
        self.namespace = settings.kubernetes_namespace
        self.cluster_name = 'configured-kubernetes-context'
        self._virtual_nodes = [{'name': 'demo-worker-1', 'status': 'Ready', 'roles': 'worker'}]
        self._virtual_pods = [{'name': f'{name}-demo', 'namespace': self.namespace, 'ready': '1/1', 'status': 'Running', 'restarts': 0}
                              for name in settings.docker_targets]

    @property
    def nodes(self): return self._virtual_nodes
    @property
    def pods(self): return self._virtual_pods

    def is_kubectl_available(self): return bool(shutil.which('kubectl'))

    def _run(self, args, timeout=10):
        try:
            res = subprocess.run(['kubectl', *args], capture_output=True, text=True, timeout=timeout)
            return {'success': res.returncode == 0, 'output': res.stdout.strip(), 'error': res.stderr.strip() if res.returncode else None}
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {'success': False, 'error': str(exc)}

    def is_live_cluster_connected(self):
        return settings.infrastructure_mode == 'kubernetes' and self._run(['cluster-info', '--request-timeout=2s'], 3)['success']

    def get_cluster_status(self):
        live = self.is_live_cluster_connected()
        simulated = settings.infrastructure_mode == 'simulation'
        return {'cluster_name': 'Demo cluster' if simulated else self.cluster_name, 'provider': 'Simulation' if simulated else 'Kubernetes' if live else 'Unavailable',
                'is_live': live, 'namespace': self.namespace, 'control_plane': 'Connected' if live else 'Not connected'}

    def get_cluster_info(self):
        return {**self.get_cluster_status(), 'nodes': self.nodes if settings.infrastructure_mode == 'simulation' else [], 'pods': self.list_pods()}

    def list_pods(self, namespace=None):
        if settings.infrastructure_mode == 'simulation':
            return self._virtual_pods
        if settings.infrastructure_mode != 'kubernetes': return []
        result = self._run(['get', 'pods', '-n', namespace or self.namespace, '-o', 'json'])
        if not result['success']: return []
        return [{'name': p['metadata']['name'], 'namespace': p['metadata']['namespace'],
                 'status': p.get('status', {}).get('phase', 'Unknown'),
                 'ready': p.get('status', {}).get('phase') == 'Running'
                     and not p['metadata'].get('deletionTimestamp')
                     and bool(p.get('status', {}).get('containerStatuses'))
                     and all(c.get('ready') is True for c in p['status']['containerStatuses'])}
                for p in json.loads(result['output']).get('items', [])]

    def rollout_restart_deployment(self, deployment_name, namespace=None):
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', deployment_name):
            return {'success': False, 'error': 'Invalid deployment name'}
        if settings.infrastructure_mode == 'simulation':
            for pod in self._virtual_pods:
                if pod['name'].startswith(deployment_name): pod['restarts'] += 1
            return {'success': True, 'simulated': True, 'message': f'Simulated restart of {deployment_name}.'}
        if settings.infrastructure_mode != 'kubernetes':
            return {'success': False, 'error': 'Kubernetes mode is not enabled'}
        result = self._run(['rollout', 'restart', f'deployment/{deployment_name}', '-n', namespace or self.namespace])
        if not result['success']: return result
        check = self._run(['rollout', 'status', f'deployment/{deployment_name}', '-n', namespace or self.namespace, '--timeout=20s'], 22)
        return {**check, 'simulated': False, 'health_verified': check['success'], 'message': 'Deployment rollout completed.' if check['success'] else 'Restart requested; rollout verification failed.'}

    def get_pod_logs(self, pod_name, namespace=None, lines=10):
        if settings.infrastructure_mode == 'simulation':
            return {'simulated': True, 'lines': ['Demo log: connection pool exhausted.']}
        res = self._run(['logs', pod_name, '-n', namespace or self.namespace, '--tail', str(lines)])
        return {**res, 'lines': res.get('output', '').splitlines()}

    def cordon_node(self, node_name):
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', node_name): return {'success': False, 'error': 'Invalid node name'}
        if settings.infrastructure_mode == 'simulation':
            node = next((n for n in self._virtual_nodes if n['name'] == node_name), None)
            if not node: return {'success': False, 'error': 'Node not found'}
            node['status'] = 'Ready,SchedulingDisabled'
            return {'success': True, 'simulated': True, 'status': 'SchedulingDisabled'}
        if settings.infrastructure_mode != 'kubernetes': return {'success': False, 'error': 'Kubernetes mode is not enabled'}
        return self._run(['cordon', node_name])

    def failover_traffic(self, from_region, to_region):
        if settings.infrastructure_mode != 'simulation':
            return {'success': False, 'error': 'No live DNS failover integration is configured'}
        return {'success': True, 'simulated': True, 'from_region': from_region, 'to_region': to_region, 'message': 'Simulated traffic failover.'}

k8s_adapter = SessionLocal('k8s', KubernetesAdapter)
