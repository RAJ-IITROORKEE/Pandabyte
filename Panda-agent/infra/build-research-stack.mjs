// Phase D3: builds the CloudFormation template for the separate research API + relay + caller role.
// Usage: node Panda-agent/infra/build-research-stack.mjs <out.json>. Inlines runtime/research-relay/index.js.
// No existing stack, API, relay, role or host service is referenced except the host security group (one added ingress rule).
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../runtime/research-relay/index.js', import.meta.url), 'utf8');
if (Buffer.byteLength(code) > 32000) throw Error('relay too large to inline');
const sub = s => ({ 'Fn::Sub': s });
const route = p => sub('arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/research/POST' + p);
const routes = ['/v1/research/turns', '/v1/research/turns/*/status', '/v1/research/turns/*/cancel'];
const apiRoutes = routes.map(p => 'execute-api:/research/POST' + p);
const invokeUri = sub('arn:${AWS::Partition}:apigateway:${AWS::Region}:lambda:path/2021-11-15/functions/${Function.Arn}/response-streaming-invocations');
const method = resource => ({ Type: 'AWS::ApiGateway::Method', Properties: { RestApiId: { Ref: 'Api' }, ResourceId: { Ref: resource }, HttpMethod: 'POST', AuthorizationType: 'AWS_IAM',
  Integration: { Type: 'AWS_PROXY', IntegrationHttpMethod: 'POST', ResponseTransferMode: 'STREAM', Uri: invokeUri, TimeoutInMillis: 150000 } } });
const resource = (parent, part) => ({ Type: 'AWS::ApiGateway::Resource', Properties: { RestApiId: { Ref: 'Api' }, ParentId: parent, PathPart: part } });
const permission = p => ({ Type: 'AWS::Lambda::Permission', Properties: { Action: 'lambda:InvokeFunction', FunctionName: { 'Fn::GetAtt': ['Function', 'Arn'] }, Principal: 'apigateway.amazonaws.com', SourceArn: route(p) } });
const vpcActions = ['ec2:CreateNetworkInterface', 'ec2:DescribeNetworkInterfaces', 'ec2:DescribeSubnets', 'ec2:DeleteNetworkInterface', 'ec2:AssignPrivateIpAddresses', 'ec2:UnassignPrivateIpAddresses'];
const tags = [{ Key: 'Project', Value: 'PandaResearchDevelopment' }];

const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Panda research path (phase D3): private relay to the host research service, separate REST API and caller role.',
  Parameters: {
    VpcId: { Type: 'AWS::EC2::VPC::Id' }, SubnetId: { Type: 'AWS::EC2::Subnet::Id' }, HostSecurityGroup: { Type: 'AWS::EC2::SecurityGroup::Id' },
    HostPrivateIp: { Type: 'String', AllowedPattern: '^(10|172|192)\\.[0-9.]+$' },
    HostTlsName: { Type: 'String', AllowedPattern: '^panda-research\\.internal$' },
    HostCaPem: { Type: 'String', NoEcho: true, MaxLength: 4096 },
    ServiceToken: { Type: 'String', NoEcho: true, AllowedPattern: '^[A-Za-z0-9+/]{43}=$' }, // base64 of 32 bytes; the host expects this exact bearer
    OidcProviderArn: { Type: 'String', AllowedPattern: '^arn:aws:iam::[0-9]{12}:oidc-provider/oidc\\.vercel\\.com/[a-z0-9-]+$' },
    OidcAudience: { Type: 'String', AllowedPattern: '^https://vercel\\.com/[a-z0-9-]+$' },
    OidcSubject: { Type: 'String', AllowedPattern: '^owner:[a-z0-9-]+:project:[a-z0-9-]+:environment:development$' },
    // Phase G: the production site may call the research API too (owner-approved 12 Nov 2026). Exact subject, never a wildcard.
    OidcProductionSubject: { Type: 'String', AllowedPattern: '^owner:[a-z0-9-]+:project:[a-z0-9-]+:environment:production$' },
  },
  Resources: {
    RelayGroup: { Type: 'AWS::EC2::SecurityGroup', Properties: { GroupDescription: 'Panda research relay', VpcId: { Ref: 'VpcId' },
      SecurityGroupEgress: [{ IpProtocol: 'tcp', FromPort: 8444, ToPort: 8444, CidrIp: sub('${HostPrivateIp}/32') }], Tags: tags } },
    HostIngress: { Type: 'AWS::EC2::SecurityGroupIngress', Properties: { GroupId: { Ref: 'HostSecurityGroup' }, IpProtocol: 'tcp', FromPort: 8444, ToPort: 8444,
      SourceSecurityGroupId: { 'Fn::GetAtt': ['RelayGroup', 'GroupId'] }, Description: 'Panda research relay only' } },
    LogGroup: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: sub('/aws/lambda/${AWS::StackName}-relay'), RetentionInDays: 1 } },
    Role: { Type: 'AWS::IAM::Role', Properties: {
      AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] },
      Policies: [{ PolicyName: 'relay-execution', PolicyDocument: { Version: '2012-10-17', Statement: [
        { Sid: 'VpcServiceLifecycle', Effect: 'Allow', Action: vpcActions, Resource: '*' },
        { Sid: 'DenyVpcCallsFromCode', Effect: 'Deny', Action: vpcActions, Resource: '*', Condition: { ArnEquals: { 'lambda:SourceFunctionArn': sub('arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-relay') } } },
        { Sid: 'Logs', Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: sub('arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/${AWS::StackName}-relay:*') },
      ] } }], Tags: tags } },
    Function: { Type: 'AWS::Lambda::Function', DependsOn: ['LogGroup'], Properties: { FunctionName: sub('${AWS::StackName}-relay'), Runtime: 'nodejs24.x', Architectures: ['arm64'], Handler: 'index.handler',
      Role: { 'Fn::GetAtt': ['Role', 'Arn'] }, MemorySize: 256, Timeout: 150, Code: { ZipFile: code },
      VpcConfig: { SubnetIds: [{ Ref: 'SubnetId' }], SecurityGroupIds: [{ 'Fn::GetAtt': ['RelayGroup', 'GroupId'] }] },
      Environment: { Variables: { PANDA_RESEARCH_RELAY_ENABLED: 'true', PANDA_RESEARCH_PRIVATE_IPV4: { Ref: 'HostPrivateIp' }, PANDA_RESEARCH_PRIVATE_PORT: '8444',
        PANDA_RESEARCH_TLS_NAME: { Ref: 'HostTlsName' }, PANDA_RESEARCH_CA_PEM: { Ref: 'HostCaPem' }, PANDA_RESEARCH_SERVICE_TOKEN: { Ref: 'ServiceToken' },
        PANDA_RESEARCH_CALLER_ARN: { 'Fn::GetAtt': ['CallerRole', 'Arn'] }, PANDA_RESEARCH_RELAY_TIMEOUT_MS: '130000' } }, Tags: tags } },
    CallerRole: { Type: 'AWS::IAM::Role', Properties: { RoleName: sub('${AWS::StackName}-caller'), MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Federated: { Ref: 'OidcProviderArn' } }, Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: { StringEquals: { 'oidc.vercel.com/unfiltered-iit-ians:aud': { Ref: 'OidcAudience' }, 'oidc.vercel.com/unfiltered-iit-ians:sub': [{ Ref: 'OidcSubject' }, { Ref: 'OidcProductionSubject' }] } } }] },
      Tags: tags } },
    CallerPolicy: { Type: 'AWS::IAM::RolePolicy', Properties: { RoleName: { Ref: 'CallerRole' }, PolicyName: 'research-invoke-only', PolicyDocument: { Version: '2012-10-17', Statement: [
        { Sid: 'OnlyResearchRoutes', Effect: 'Allow', Action: 'execute-api:Invoke', Resource: routes.map(route) },
        { Sid: 'DenyOtherRoutes', Effect: 'Deny', Action: 'execute-api:Invoke', NotResource: routes.map(route) },
        { Sid: 'DenyNonInvoke', Effect: 'Deny', NotAction: 'execute-api:Invoke', Resource: '*' },
      ] } } },
    Api: { Type: 'AWS::ApiGateway::RestApi', DependsOn: ['CallerRole'], Properties: { Name: sub('${AWS::StackName}-research'), EndpointConfiguration: { Types: ['REGIONAL'] },
      Policy: { Version: '2012-10-17', Statement: [
        { Effect: 'Allow', Principal: { AWS: { 'Fn::GetAtt': ['CallerRole', 'Arn'] } }, Action: 'execute-api:Invoke', Resource: apiRoutes },
        { Effect: 'Deny', Principal: '*', Action: 'execute-api:Invoke', Resource: 'execute-api:/*', Condition: { ArnNotEquals: { 'aws:PrincipalArn': { 'Fn::GetAtt': ['CallerRole', 'Arn'] } } } },
        { Effect: 'Deny', Principal: '*', Action: 'execute-api:Invoke', NotResource: routes.map(p => sub('arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:*/research/POST' + p)) },
      ] }, Tags: tags } },
    V1: resource({ 'Fn::GetAtt': ['Api', 'RootResourceId'] }, 'v1'),
    Research: resource({ Ref: 'V1' }, 'research'),
    Turns: resource({ Ref: 'Research' }, 'turns'),
    TurnId: resource({ Ref: 'Turns' }, '{id}'),
    Status: resource({ Ref: 'TurnId' }, 'status'),
    Cancel: resource({ Ref: 'TurnId' }, 'cancel'),
    TurnMethod: method('Turns'), StatusMethod: method('Status'), CancelMethod: method('Cancel'),
    TurnPermission: permission(routes[0]), StatusPermission: permission(routes[1]), CancelPermission: permission(routes[2]),
    DeploymentV1: { Type: 'AWS::ApiGateway::Deployment', DependsOn: ['TurnMethod', 'StatusMethod', 'CancelMethod'], Properties: { RestApiId: { Ref: 'Api' } } },
    Stage: { Type: 'AWS::ApiGateway::Stage', Properties: { RestApiId: { Ref: 'Api' }, DeploymentId: { Ref: 'DeploymentV1' }, StageName: 'research',
      MethodSettings: [{ ResourcePath: '/*', HttpMethod: '*', ThrottlingRateLimit: 2, ThrottlingBurstLimit: 4, DataTraceEnabled: false, LoggingLevel: 'OFF' }], Tags: tags } },
  },
  Outputs: {
    Endpoint: { Value: sub('https://${Api}.execute-api.${AWS::Region}.amazonaws.com/research') },
    CallerRoleArn: { Value: { 'Fn::GetAtt': ['CallerRole', 'Arn'] } },
    RelaySecurityGroup: { Value: { 'Fn::GetAtt': ['RelayGroup', 'GroupId'] } },
  },
};
const out = process.argv[2];
if (!out) throw Error('usage: build-research-stack.mjs <out.json>');
fs.writeFileSync(out, JSON.stringify(template, null, 1));
console.log('template written', Buffer.byteLength(JSON.stringify(template)));
