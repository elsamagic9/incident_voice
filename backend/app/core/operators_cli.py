"""Local administration: python -m app.core.operators_cli --help.

Run in the backend environment with the same data volume as the server.
The token prompt is hidden and never appears in process arguments or output.
"""
import argparse
import getpass
from app.core.auth_rbac import operator_registry, SRERole


def main():
    parser = argparse.ArgumentParser(description='Provision, rotate or revoke a local operator identity')
    parser.add_argument('action', choices=['register', 'revoke', 'list'])
    parser.add_argument('--id', dest='operator_id')
    parser.add_argument('--name')
    parser.add_argument('--role', choices=[role.value for role in SRERole])
    args = parser.parse_args()
    if args.action == 'list':
        for op in operator_registry.list_operators():
            print(f"{op['operator_id']}\t{op['name']}\t{op['role']}\t{'revoked' if op['revoked'] else 'active'}")
        return
    if not args.operator_id or args.operator_id == operator_registry.CONFIGURED_ID:
        parser.error('Supply a distinct --id; the environment-token identity is reserved')
    if args.action == 'revoke':
        if not operator_registry.revoke_operator(args.operator_id):
            parser.error('Operator not found')
        print('Operator revoked.')
        return
    if not args.name or not args.role:
        parser.error('Registration requires --name and --role')
    token = getpass.getpass('New random access token (at least 32 characters): ')
    if len(token) < 32:
        parser.error('Use a randomly generated token with at least 32 characters')
    try:
        operator_registry.register_operator(args.operator_id, args.name, SRERole(args.role), token)
    except ValueError as exc:
        parser.error(str(exc))
    print('Operator saved. Previous credentials and sessions are invalid after rotation.')


if __name__ == '__main__':
    main()
