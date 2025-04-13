import React, { useState, useEffect } from "react";
import {
  Layout,
  Table,
  Card,
  Form,
  Input,
  DatePicker,
  Button,
  Space,
  Checkbox,
  Typography,
  Radio,
  Modal,
  message,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  MailOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import styled from "styled-components";
import moment from "moment";
import { useNavigate } from "react-router-dom";

import { server } from "../global.json";

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;
const { Title } = Typography;

const StyledLayout = styled(Layout)`
  width: 90vw;
  min-height: 100vh;
  margin: 0 auto;
`;

const StyledHeader = styled(Header)`
  background: white;
  padding: 0 24px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`;

const StyledContent = styled(Content)`
  padding: 24px;
`;

const LogSearch = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [emailDetails, setEmailDetails] = useState(null);

  const navigate = useNavigate();

  const fetchErrors = async (values) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_time: values?.timeRange?.[0]?.toISOString(),
        end_time: values?.timeRange?.[1]?.toISOString(),
        unique:
          values?.unique === "unique"
            ? "true"
            : values?.unique === "repeated"
            ? "false"
            : "",
      });

      const response = await fetch(`${server}/api/admin/get_error?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        message.error(result.message);
        navigate("/login");
      }
    } catch (error) {
      message.error("Failed to fetch errors");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  const viewErrorDetails = async (uuid) => {
    try {
      const response = await fetch(`${server}/api/admin/error/${uuid}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setSelectedError(result.data);
        setDetailModalVisible(true);
      }
    } catch (error) {
      message.error("Failed to fetch error details");
    }
  };

  const viewEmailDetails = async (uuid) => {
    try {
      const response = await fetch(`${server}/api/admin/error/${uuid}/email`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setEmailDetails(result.data);
        setEmailModalVisible(true);
      }
    } catch (error) {
      message.error("Failed to fetch email details");
    }
  };

  const sendAlert = async (uuid) => {
    try {
      const response = await fetch(
        `${server}/api/admin/error/${uuid}/send_alert`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      const result = await response.json();
      if (result.success) {
        message.success("Alert sent successfully");
      } else {
        message.error(result.message);
      }
    } catch (error) {
      message.error("Failed to send alert");
    }
  };

  const columns = [
    {
      title: "Time",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (text) => moment(text).format("YYYY-MM-DD HH:mm:ss"),
      width: 200,
    },
    {
      title: "Identity Header",
      dataIndex: "identity_header",
      key: "identity_header",
      ellipsis: true,
    },
    {
      title: "Error",
      dataIndex: "Identity_error",
      key: "Identity_error",
      ellipsis: true,
    },
    {
      title: "Action",
      key: "action",
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => viewErrorDetails(record.uuid)}
          >
            Details
          </Button>
          <Button
            icon={<MailOutlined />}
            onClick={() => viewEmailDetails(record.uuid)}
          >
            Email
          </Button>
        </Space>
      ),
    },
  ];

  const onReset = () => {
    form.resetFields();
    fetchErrors({});
  };

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      navigate("/login");
    }
  }, [navigate]);

  return (
    <StyledLayout>
      <StyledContent>
        <Card style={{ marginBottom: 24 }}>
          <Form form={form} layout="vertical" onFinish={fetchErrors}>
            <div style={{ display: "flex", gap: "24px" }}>
              <Form.Item
                label="Time Range"
                name="timeRange"
                style={{ flex: 1 }}
              >
                <RangePicker showTime style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item label="Filter" name="unique" style={{ flex: 1 }}>
                <Radio.Group>
                  <Radio.Button value="all">All</Radio.Button>
                  <Radio.Button value="unique">Unique</Radio.Button>
                  <Radio.Button value="repeated">Repeated</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
              }}
            >
              <Button icon={<ReloadOutlined />} onClick={onReset}>
                Reset
              </Button>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                htmlType="submit"
              >
                Search
              </Button>
            </div>
          </Form>
        </Card>

        <Card>
          <Table
            columns={columns}
            dataSource={data}
            loading={loading}
            scroll={{ x: 800 }}
            rowKey="uuid"
            pagination={{
              total: data.length,
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} items`,
            }}
          />
        </Card>

        <Modal
          title="Error Details"
          open={detailModalVisible}
          onCancel={() => setDetailModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setDetailModalVisible(false)}>
              Close
            </Button>,
            <Button
              key="send"
              type="primary"
              onClick={() => sendAlert(selectedError?.uuid)}
            >
              Send Alert
            </Button>,
          ]}
          width={800}
        >
          {selectedError && (
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(selectedError, null, 2)}
            </pre>
          )}
        </Modal>

        <Modal
          title="Email Preview"
          open={emailModalVisible}
          onCancel={() => setEmailModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setEmailModalVisible(false)}>
              Close
            </Button>,
          ]}
          width={800}
        >
          {emailDetails && (
            <div>
              <p>
                <strong>To:</strong> {emailDetails.to_email}
              </p>
              <p>
                <strong>Subject:</strong> {emailDetails.subject}
              </p>
              <p>
                <strong>Content:</strong>
              </p>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {emailDetails.content}
              </pre>
            </div>
          )}
        </Modal>
      </StyledContent>
    </StyledLayout>
  );
};

export default LogSearch;
